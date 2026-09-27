/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * Dev and build write to separate directories.
   *
   * Both default to `.next`, which means a production build and a running dev server
   * fight over the same files. Two failures come out of that, and both look like a
   * broken app rather than a tooling clash:
   *
   *   - switching between `next build` and `next dev` throws
   *     `EINVAL: invalid argument, readlink '.next/package.json'` on this
   *     OneDrive-synced folder, because the two modes lay the directory out differently
   *   - a build started while dev is running pulls the chunks out from under it, so any
   *     route the dev server has not already compiled returns a bare 500
   *
   * Giving each mode its own directory removes both without anything to remember. Next
   * evaluates this file per command, and NODE_ENV is set by the command itself.
   */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',

  // No `X-Powered-By: Next.js` on every response.
  poweredByHeader: false,

  /*
   * The app imports the engine from the repo root (`brandstate` → `../dist`), so file
   * tracing has to start there. Left to guess — there are two lockfiles — Next warns, and
   * a deployment can ship server functions without the engine files they import.
   */
  outputFileTracingRoot: require('path').join(__dirname, '..'),

  /*
   * Cache the images in /public. Next already caches its own hashed JS, CSS and fonts
   * forever; files in /public are served with no caching, so every visit re-checked them.
   * Their names aren't content-hashed, so a day plus stale-while-revalidate rather than
   * "immutable": a replaced image still shows up without a redeploy of every page.
   */
  async headers() {
    return [
      {
        source: '/:file*.(png|webp|jpg|jpeg|svg|ico)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ]
  },
}

module.exports = nextConfig
