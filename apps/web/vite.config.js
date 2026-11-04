import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';

// SvelteKit 3: what was svelte.config.js is passed to the sveltekit() plugin.

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: { runes: true },
      adapter: adapter({
        fallback: 'index.html',
        strict: false,
        // Also write .br / .gz copies; the API serves them to browsers that
        // accept them (see staticCacheHeaders in apps/api/lib/static-cache.js).
        precompress: true
      })
    })
  ],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true
      }
    }
  }
};

export default config;
