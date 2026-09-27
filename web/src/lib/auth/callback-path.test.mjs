/**
 * The callback-path guard.
 *
 * This is the open-redirect check. A login page that will bounce a browser to any URL a
 * query string names is a phishing primitive, because the link genuinely starts on a
 * domain the user trusts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { safeCallbackPath } = await import('./callback-path.ts');

describe('safeCallbackPath accepts only paths on this origin', () => {
  it('accepts an ordinary path', () => {
    assert.equal(safeCallbackPath('/new'), '/new');
    assert.equal(safeCallbackPath('/project/abc/discover'), '/project/abc/discover');
    assert.equal(safeCallbackPath('/new?x=1#top'), '/new?x=1#top');
  });

  it('rejects an absolute URL', () => {
    for (const bad of [
      'https://evil.example/',
      'http://evil.example',
      'HTTPS://evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>',
    ]) {
      assert.equal(safeCallbackPath(bad), null, bad);
    }
  });

  it('rejects protocol-relative and backslash forms, which browsers treat as absolute', () => {
    assert.equal(safeCallbackPath('//evil.example/'), null);
    assert.equal(safeCallbackPath('/\\evil.example'), null);
  });

  it('rejects control characters, which can be used to smuggle a header', () => {
    assert.equal(safeCallbackPath('/new\nLocation: https://evil.example'), null);
    assert.equal(safeCallbackPath('/new\r\nSet-Cookie: a=b'), null);
    assert.equal(safeCallbackPath('/new\u0000'), null);
  });

  it('rejects empty and non-string input', () => {
    assert.equal(safeCallbackPath(''), null);
    assert.equal(safeCallbackPath(null), null);
    assert.equal(safeCallbackPath(undefined), null);
  });
});
