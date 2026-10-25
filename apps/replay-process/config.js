// config.js
// Credentials are read from the environment. Never commit real keys.
// Node 20.12+ also loads a local .env file when present.

try {
  process.loadEnvFile?.();
} catch {
  // No .env file; rely on the real environment.
}

module.exports = {
  API_KEY: process.env.CHALLONGE_API_KEY || '',
  SUB_DOMAIN: process.env.CHALLONGE_SUBDOMAIN || '',
  BNET_CONFIG: process.env.BNET_CONFIG || '.cache/battlenet_ids.json',
  REPLAY_FILE: process.env.REPLAY_FILE || '.cache/replay_dat_{path_name}.json',
  OUTPUT_FILE: process.env.OUTPUT_FILE || '.cache/results.json',
  PYTHON_SCRIPT: process.env.PYTHON_SCRIPT || './replayreader.py',
  TEMP_REPLAY_DIR: process.env.TEMP_REPLAY_DIR || '.cache',
};
