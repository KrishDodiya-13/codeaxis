/**
 * Password hashing and email normalization.
 *
 * Run with: node --test src/lib/auth/*.test.mjs
 * Plain .mjs so it runs under node:test without the web app's bundler.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

// The implementation is TypeScript; Node strips types for these two modules.
const { hashPassword, verifyPassword, passwordProblems, MIN_PASSWORD_LENGTH } = await import(
  './password.ts'
);
const { normalizeEmail } = await import('./email-address.ts');

describe('password hashing', () => {
  it('never stores the password itself', async () => {
    const hash = await hashPassword('correct-horse-battery');
    assert.ok(!hash.includes('correct-horse-battery'));
    assert.match(hash, /^scrypt\$65536\$8\$1\$/);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    assert.equal(await verifyPassword('correct-horse-battery', hash), true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    assert.equal(await verifyPassword('correct-horse-batterz', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password-twice');
    const b = await hashPassword('same-password-twice');
    assert.notEqual(a, b);
    // Both still verify.
    assert.equal(await verifyPassword('same-password-twice', a), true);
    assert.equal(await verifyPassword('same-password-twice', b), true);
  });

  it('returns false for an account with no password, rather than throwing', async () => {
    // An OAuth-only user has passwordHash null.
    assert.equal(await verifyPassword('anything', null), false);
    assert.equal(await verifyPassword('anything', undefined), false);
  });

  it('returns false for a malformed hash rather than throwing', async () => {
    for (const bad of ['', 'nonsense', 'scrypt$1$2$3', 'bcrypt$65536$8$1$aa$bb', 'scrypt$x$y$z$aa$bb']) {
      assert.equal(await verifyPassword('anything', bad), false, bad);
    }
  });

  it('carries its cost parameters, so they can be raised without breaking old hashes', async () => {
    const hash = await hashPassword('parameterised');
    const [prefix, N, r, p] = hash.split('$');
    assert.equal(prefix, 'scrypt');
    assert.equal(Number(N), 65536);
    assert.equal(Number(r), 8);
    assert.equal(Number(p), 1);
  });
});

describe('password policy', () => {
  it('requires length', () => {
    assert.ok(passwordProblems('short').length > 0);
    assert.deepEqual(passwordProblems('a'.repeat(MIN_PASSWORD_LENGTH - 1)).length > 0, true);
    assert.deepEqual(passwordProblems('a-perfectly-fine-passphrase'), []);
  });

  it('rejects a single repeated character even when long', () => {
    assert.ok(passwordProblems('aaaaaaaaaaaaaaaa').length > 0);
  });

  it('rejects whitespace-only and over-long input', () => {
    assert.ok(passwordProblems('               ').length > 0);
    assert.ok(passwordProblems('x'.repeat(500)).length > 0);
  });
});

describe('email normalization', () => {
  it('lowercases and trims, so one address cannot become two accounts', () => {
    assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
  });

  it('rejects things that are not addresses', () => {
    for (const bad of ['', 'notanemail', 'a@b', 'no spaces@example.com', '@example.com', 'a@@b.com']) {
      assert.equal(normalizeEmail(bad), null, bad);
    }
  });

  it('does not strip dots or plus tags, which are provider conventions not rules', () => {
    assert.equal(normalizeEmail('ada.lovelace+brandos@example.com'), 'ada.lovelace+brandos@example.com');
  });
});
