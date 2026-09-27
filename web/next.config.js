/** @type {import('next').NextConfig} */
const nextConfig = {
  // .png is handled natively by Next.js; .glb/.gltf need an asset rule.
  webpack(config) {
    config.module.rules.push({ test: /\.(glb|gltf)$/, type: 'asset/resource' })
    return config
  },
}

module.exports = nextConfig
