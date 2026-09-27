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
}

module.exports = nextConfig
