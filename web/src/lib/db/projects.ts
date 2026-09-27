/**
 * Reading and writing projects and their brand state.
 *
 * Every state that comes out of the database is parsed with the engine's schema before
 * anything uses it, and every state going in is parsed before it is stored. The
 * database column is `Json`, which means Prisma will happily store and return anything
 * — so this module is the only place that turns an opaque JSON blob into a `BrandState`
 * anyone can trust.
 */
import type { Prisma, Project, ProjectStatus } from '@prisma/client';
import {
  SCHEMA_VERSION,
  createInitialState,
  migrateState,
  needsMigration,
  parseBrandState,
} from 'brandstate';
import type { BrandState } from 'brandstate';
import { prisma } from '@/lib/db/client';
import type { ProjectSummary } from '@/lib/api/contracts';

/** Thrown when a project id does not exist. */
export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`No project with id ${id}.`);
    this.name = 'ProjectNotFoundError';
  }
}

/**
 * Thrown when a stored state cannot be read as a `BrandState`.
 *
 * Kept distinct from a request-validation failure: this is corrupt or unmigratable
 * data, which is an operational problem rather than a caller mistake.
 */
export class CorruptBrandStateError extends Error {
  constructor(projectId: string, detail: string) {
    super(`The stored brand state for project ${projectId} could not be read: ${detail}`);
    this.name = 'CorruptBrandStateError';
  }
}

export function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    originalIdea: project.originalIdea,
    ...(project.productType === null ? {} : { productType: project.productType }),
    ...(project.goal === null ? {} : { goal: project.goal }),
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Creates a project and its initial, empty brand state in one transaction. */
export async function createProject(input: {
  /** The owner. Required, so a project cannot be created without one. */
  userId: string;
  idea: string;
  name?: string;
  productType?: string;
  goal?: string;
}): Promise<{ project: Project; brandState: BrandState }> {
  const state = createInitialState({
    idea: input.idea,
    ...(input.productType === undefined ? {} : { productType: input.productType }),
    ...(input.goal === undefined ? {} : { goal: input.goal }),
  });

  // The project row and its state row are written together: a project with no state
  // would break every stage that reads one.
  const project = await prisma.project.create({
    data: {
      id: state.id,
      userId: input.userId,
      name: input.name ?? deriveName(input.idea),
      originalIdea: input.idea,
      productType: input.productType ?? null,
      goal: input.goal ?? null,
      status: 'DISCOVERY',
      brandState: {
        create: {
          state: state as unknown as Prisma.InputJsonValue,
          schemaVersion: state.schemaVersion,
        },
      },
    },
  });

  return { project, brandState: state };
}

/** A short project name from the idea, for the sidebar. */
function deriveName(idea: string): string {
  const firstSentence = idea.split(/[.!?\n]/)[0]?.trim() ?? idea;
  const words = firstSentence.split(/\s+/).slice(0, 8).join(' ');
  return words.length > 0 ? words.slice(0, 120) : 'Untitled brand';
}

export async function getProject(id: string, userId: string): Promise<Project> {
  // Scoped in the WHERE clause rather than fetched and then compared. Two reasons: the
  // database cannot return a row the caller does not own, so there is no window in which
  // someone else's project exists in memory; and a non-owner gets the same
  // "not found" as a stranger id, which keeps the API from confirming that a project
  // exists at all.
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (project === null) throw new ProjectNotFoundError(id);
  return project;
}

/** Every project owned by one user, newest first. */
export async function listProjects(userId: string): Promise<Project[]> {
  return prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
}

/**
 * Loads a project's brand state, migrating it if it predates the current contract.
 *
 * A migration that happens on read is written straight back, so the next read does not
 * repeat it and a migration sweep can find what is still old by `schemaVersion`.
 */
export async function loadBrandState(projectId: string, userId: string): Promise<BrandState> {
  // Ownership is established before the state is read, so a state is never loaded for
  // somebody else's project even briefly.
  const record = await prisma.brandStateRecord.findFirst({
    where: { projectId, project: { userId } },
  });
  if (record === null) throw new ProjectNotFoundError(projectId);

  const raw: unknown = record.state;

  try {
    if (needsMigration(raw)) {
      const migrated = migrateState(raw).state;
      const state = parseBrandState(migrated);
      await saveBrandState(projectId, userId, state);
      return state;
    }
    return parseBrandState(raw);
  } catch (error) {
    throw new CorruptBrandStateError(projectId, (error as Error).message);
  }
}

/**
 * Writes a brand state back.
 *
 * Validated before it is stored, so an invalid state fails here rather than being
 * discovered on the next read by a different stage.
 */
export async function saveBrandState(
  projectId: string,
  userId: string,
  state: BrandState,
): Promise<BrandState> {
  const validated = parseBrandState(state);

  // updateMany, because only it accepts a relation filter — so the ownership condition is
  // part of the write itself. A write that matches nothing means the caller does not own
  // the project, which is reported as not-found rather than as a successful no-op.
  const result = await prisma.brandStateRecord.updateMany({
    where: { projectId, project: { userId } },
    data: {
      state: validated as unknown as Prisma.InputJsonValue,
      schemaVersion: validated.schemaVersion,
    },
  });

  if (result.count === 0) throw new ProjectNotFoundError(projectId);

  return validated;
}

/**
 * Advances the project's status, but never backwards.
 *
 * A stage that is re-run — discovery answered again after positioning — must not drag
 * the project back to an earlier status and make the UI look like work was lost.
 */
export async function advanceStatus(
  projectId: string,
  userId: string,
  to: ProjectStatus,
): Promise<Project> {
  const order: ProjectStatus[] = ['DISCOVERY', 'POSITIONING', 'STRATEGY', 'STRESS_TEST', 'COMPLETE'];
  // Throws when the caller is not the owner, so the update below cannot be reached.
  const project = await getProject(projectId, userId);

  if (order.indexOf(to) <= order.indexOf(project.status)) {
    // Still touch updatedAt, so the UI can tell something happened.
    return prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  }

  return prisma.project.update({ where: { id: projectId }, data: { status: to } });
}

/** The current contract version, for a migration sweep. */
export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;
