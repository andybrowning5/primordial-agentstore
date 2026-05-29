// @ts-check
import { defineConfig } from 'astro/config';

// Static-first storefront. Output is a fully static export in ./dist,
// deployable to any CDN (Vercel, Cloudflare Pages, etc.).
export default defineConfig({
  output: 'static',
  // Set this to your deployed origin when publishing; used for canonical URLs.
  // site: 'https://primordial.dev',
});
