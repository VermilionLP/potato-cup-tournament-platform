// Compiles the given .svelte / .svelte.js files and prints compile errors.
// Run through scripts/svelte-check-offline.sh, which provides the compiler.

import fs from 'node:fs';

// The Svelte source expects this build-time global.
globalThis.DEBUG = false;
const { compile, compileModule } = await import('svelte/compiler');

let failed = 0;
for (const file of process.argv.slice(2)) {
  try {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.svelte')) compile(source, { filename: file, generate: 'client', runes: true });
    else compileModule(source, { filename: file, generate: 'client' });
  } catch (err) {
    failed += 1;
    const where = err.start ? `:${err.start.line}:${err.start.column}` : '';
    console.log(`ERROR ${file}${where}\n  ${String(err.message).split('\n')[0]}`);
  }
}
console.log(failed ? `${failed} file(s) failed to compile` : 'all files compile');
process.exit(failed ? 1 : 0);
