import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter({
      fallback: 'index.html',
      strict: false,
      // Also write .br / .gz copies; the API serves them to browsers that
      // accept them (see staticCacheHeaders in apps/api/lib/static-cache.js).
      precompress: true
    })
  }
};

export default config;
