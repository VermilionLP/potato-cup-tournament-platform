// file-type 16's API on top of file-type >= 21.3.1 (GHSA-5v7r-6r5c-r473:
// infinite loop in the ASF parser before 21.3.1).
//
// koishi 4.18 pulls in @cordisjs/plugin-http 0.6.3, which depends on
// file-type ^16 and calls `FileType.fromBuffer(data)` (default import).
// file-type 17+ is ESM only and renamed it fileTypeFromBuffer. The root
// pnpm-workspace.yaml overrides plugin-http's file-type with this package.
// Drop it once koishi moves to a newer plugin-http.

let loaded;
const fileType = () => (loaded ??= import('file-type'));

exports.fromBuffer = async (input) => (await fileType()).fileTypeFromBuffer(input);
exports.fromStream = async (stream) => (await fileType()).fileTypeFromStream(stream);
exports.fromTokenizer = async (tokenizer) => (await fileType()).fileTypeFromTokenizer(tokenizer);
