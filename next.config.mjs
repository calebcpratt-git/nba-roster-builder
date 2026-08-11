// The data-schema dashboard under app/data is a local-only tool, not part of
// the shipped app. Its route files are named `page.dev.tsx` / `route.dev.ts`,
// and `dev.*` is only a recognized page extension outside production — so
// `next build` never resolves them into routes and nothing about the
// dashboard reaches the deployed bundle. `/data` 404s there exactly as it
// would if the directory didn't exist.
const devOnlyPageExtensions = process.env.NODE_ENV === 'production' ? [] : ['dev.tsx', 'dev.ts']

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: [...devOnlyPageExtensions, 'tsx', 'ts', 'jsx', 'js'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
