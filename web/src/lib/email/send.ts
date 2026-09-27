/**
 * Email delivery. Server-side only.
 *
 * One abstraction, one env-configured provider behind it, so adding a real service later
 * is a new branch in `deliver` rather than a change anywhere that sends mail.
 *
 * ## The development provider writes files rather than logging
 *
 * A reset code must never reach a log — logs get shipped to aggregators, kept for months
 * and read by people who should not have working codes. But a developer with no mail
 * provider still has to be able to complete the flow. So the default provider writes the
 * whole message to a gitignored file under `.mail/`, which is readable by the person at
 * the keyboard and by nothing else. It is not a log, and it is refused outright in
 * production.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailProviderName = 'file' | 'smtp' | 'resend';

/** Thrown when the configured provider cannot be used as configured. */
export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigError';
  }
}

/** Where a `file` provider writes. Gitignored. */
const MAIL_DIR = '.mail';

export function emailProvider(): EmailProviderName {
  const raw = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'smtp' || raw === 'resend' || raw === 'file') return raw;
  // Defaulting to `file` keeps a fresh clone working without an account, and the
  // production guard below stops that default from shipping by accident.
  return 'file';
}

export const productName = 'BRANDOS';

/**
 * Sends a message.
 *
 * Throws on a misconfigured provider rather than silently dropping mail: a reset code
 * that was never delivered looks identical to one the user did not receive, and the
 * person waiting has no way to tell.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = emailProvider();

  if (provider === 'file') {
    if (process.env.NODE_ENV === 'production') {
      throw new EmailConfigError(
        'EMAIL_PROVIDER is "file", which writes mail to disk instead of sending it. ' +
          'Set EMAIL_PROVIDER=smtp or resend, with its credentials, before running in production.',
      );
    }
    await writeToFile(message);
    return;
  }

  if (provider === 'resend') {
    await sendViaResend(message);
    return;
  }

  await sendViaSmtp(message);
}

/** Development only. One file per message, newest name last. */
async function writeToFile(message: EmailMessage): Promise<void> {
  await mkdir(MAIL_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const body = [
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Date: ${new Date().toISOString()}`,
    '',
    message.text,
    '',
  ].join('\n');

  await writeFile(join(MAIL_DIR, `${stamp}.txt`), body, 'utf8');
  // Says that mail was written and where, without any of its contents.
  console.info(`[brandos] email written to ${MAIL_DIR}/ (EMAIL_PROVIDER=file, development only)`);
}

/**
 * Resend, over its HTTP API.
 *
 * No SDK: it is one authenticated POST, and a dependency for that is not worth the
 * supply chain.
 */
async function sendViaResend(message: EmailMessage): Promise<void> {
  const key = (process.env.RESEND_API_KEY ?? '').trim();
  const from = (process.env.EMAIL_FROM ?? '').trim();
  if (key === '' || from === '') {
    throw new EmailConfigError('EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // The provider's body can quote the recipient; the status is enough to act on and
    // carries nothing about the message.
    throw new EmailConfigError(`Resend rejected the message (${response.status}).`);
  }
}

/**
 * SMTP, via nodemailer when it is installed.
 *
 * Imported dynamically so the package is only required by deployments that choose SMTP —
 * a file or Resend deployment should not have to install it.
 */
async function sendViaSmtp(message: EmailMessage): Promise<void> {
  const host = (process.env.SMTP_HOST ?? '').trim();
  const from = (process.env.EMAIL_FROM ?? '').trim();
  if (host === '' || from === '') {
    throw new EmailConfigError('EMAIL_PROVIDER=smtp needs SMTP_HOST and EMAIL_FROM.');
  }

  // Loaded through `createRequire` rather than `import()`. A dynamic import with a
  // non-literal specifier makes the bundler try to resolve every module that could match,
  // which hangs the dev server's compile — measured, not guessed. A runtime require is not
  // analysed at build time, so an optional package stays genuinely optional.
  let loaded: unknown;
  try {
    const require_ = createRequire(import.meta.url);
    loaded = require_('nodemailer');
  } catch {
    throw new EmailConfigError(
      'EMAIL_PROVIDER=smtp needs nodemailer. Run: npm install nodemailer',
    );
  }

  const candidate = loaded as { default?: unknown; createTransport?: unknown };
  const module_ =
    typeof candidate.createTransport === 'function'
      ? candidate
      : (candidate.default as { createTransport?: unknown } | undefined);

  if (module_ === undefined || typeof module_.createTransport !== 'function') {
    throw new EmailConfigError('nodemailer is installed but does not export createTransport.');
  }

  const createTransport = module_.createTransport as (options: unknown) => {
    sendMail: (message: unknown) => Promise<unknown>;
  };

  const port = Number(process.env.SMTP_PORT ?? '587');
  const transport = createTransport({
    host,
    port,
    // Implicit TLS on 465; STARTTLS otherwise.
    secure: port === 465,
    ...(process.env.SMTP_USER === undefined
      ? {}
      : { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } }),
  });

  await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text });
}
