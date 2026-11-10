import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import FileType from './index.cjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('fromBuffer works as in file-type 16, from ESM and CommonJS', async () => {
  assert.deepEqual(await FileType.fromBuffer(PNG), { ext: 'png', mime: 'image/png' });
  const cjs = createRequire(import.meta.url)('./index.cjs');
  assert.equal((await cjs.fromBuffer(Buffer.from('not a known file'))), undefined);
});
