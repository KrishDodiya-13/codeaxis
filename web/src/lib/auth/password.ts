/**
 * Password hashing and verification. Server-side only.
 *
 * ## Why scrypt from `node:crypto`
 *
 * scrypt is a memory-hard KDF designed for exactly this, and it ships with Node — so
 * there is no native module to build, which matters on Windows where bcrypt and argon2
 * both need a toolchain. The cost parameters are stored with each hash, so raising them
 * later does not invalidate existing passwords: an old hash keeps verifying against the
 * parameters it was made with.
 *
 * Nothing here is reversible and nothing is logged. A plaintext password exists only as
 * the argument to these two functions.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * Promise wrapper around `scrypt`.
 *
 * Written out rather than `promisify`d because the promisified type drops the options
 * overload, and the cost parameters are the whole point of calling it.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error !== null) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Cost parameters. N=2^16 with r=8, p=1 needs ~64MB and takes roughly 100ms — slow
 * enough to make offline guessing expensive, fast enough for a login request.
 */
const COST = { N: 65536, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Node's default maxmem is too small for N=2^16, so it is raised to match. */
const MAX_MEM = 256 * 1024 * 1024;

/** How a stored hash is laid out, so the parameters travel with it. */
const PREFIX = 'scrypt';

export type PasswordPolicyIssue = string;

/** The shortest password accepted. Length beats composition rules for real strength. */
export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;

/**
 * Why a password is unacceptable, or an empty list when it is fine.
 *
 * Deliberately length-led rather than a character-class checklist: those push people
 * toward `Passw0rd!`, which is weaker than a long ordinary phrase. The upper bound is
 * there because scrypt cost grows with input and an unbounded password is a cheap way to
 * tie up the server.
 */
export function passwordProblems(password: string): PasswordPolicyIssue[] {
  const problems: PasswordPolicyIssue[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (password.trim() === '') {
    problems.push('A password cannot be only whitespace.');
  }
  // One very common shape worth blocking outright, since it defeats the length rule.
  if (/^(.)\1+$/.test(password)) {
    problems.push('A single repeated character is not a password.');
  }

  return problems;
}

/** Hashes a password. The salt and cost parameters are embedded in the result. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...COST, maxmem: MAX_MEM });

  return [
    PREFIX,
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Whether `password` matches `stored`.
 *
 * Returns false rather than throwing on a malformed or absent hash: an OAuth-only account
 * has no password, and a caller should not have to tell "wrong password" apart from "no
 * password set" — both mean "this credential does not sign you in".
 *
 * The comparison is timing-safe, so a near-miss cannot be distinguished from a far one.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (stored === null || stored === undefined) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  } catch {
    // Parameters that Node refuses, e.g. from a corrupted row.
    return false;
  }

  // Equal lengths are guaranteed by deriving to `expected.length`, which timingSafeEqual
  // requires — it throws on a mismatch rather than returning false.
  return timingSafeEqual(derived, expected);
}

/**
 * Burns roughly the time a real verification takes.
 *
 * Called when no account exists, so "unknown email" and "wrong password" take comparable
 * time. Without it, a fast rejection tells an attacker the address is not registered.
 */
export async function equalizeVerifyTiming(): Promise<void> {
  await verifyPassword('timing-equalization', await DUMMY_HASH);
}

/**
 * Computed once per process, lazily.
 *
 * Hashing it on every call would double the work; hashing it at import would slow cold
 * start for requests that never need it.
 */
const DUMMY_HASH: Promise<string> = hashPassword('timing-equalization-placeholder');
