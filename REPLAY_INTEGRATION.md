# Replay Processing & Analysis Integration Plan

This plan details how to integrate the SC2 replay parsing (`replay-process`) and visual analysis (`sc2replay_online_analysis`) into the `suck-tournament` system.

---

## 1. Architecture Choice: Server-Side Parsing (Python)

Given the CDN access issues with Pyodide in China, we will use **Server-Side Python parsing** (Option B):

- **Workflow**:
  1. The user uploads one or more `.SC2Replay` files to the backend.
  2. The Fastify backend saves the file temporarily, runs a Python parser helper script (leveraging `sc2reader` and `spawningtool`), and captures the parsed JSON output.
  3. The backend compresses the raw replay file using Node's native `zlib` (Gzip) and stores it as a `BLOB` in SQLite, alongside the parsed JSON text and key columns.
  4. The temporary files are cleaned up.

### Runtime Environment Check (Robustness)
To ensure the deployment server has the required Python environment:
- On startup, the Fastify server checks for the availability of `python3`/`python` and logs status.
- If python or required libraries (`sc2reader`, `spawningtool`) are missing, the server warns on startup and returns a graceful error on upload attempts.

---

## 2. Access Control: QQ Group Verification

To prevent unauthorized uploads while keeping things simple:
- A simple QQ Group Verification screen will block entry to the tournament app before player ID registration/login.
- Users must enter one of the two allowed QQ group numbers.
- Once entered, this value is persisted in `localStorage`.
- The backend verifies the group number (sent in request headers) against environment-configured allowed QQ groups before allowing uploads or match result submissions.

---

## 3. Liquipedia Wiki Script Generation

After replays are uploaded and parsed, we will integrate a feature to generate a **Liquipedia-format wiki script**:
- We will adapt the generation logic from `replay-process/lib/wiki.js`.
- On the tournament page, a button **"Generate Liquipedia Wiki"** will compile the match results, maps, scores, and player races directly into the Liquipedia template format, allowing easy copy-pasting.

## 4. Database Schema & Migration (`api/`)

To support future data structure changes robustly, we will implement a **version-based migration system** in `api/plugins/database.js` using SQLite's built-in `user_version` PRAGMA instead of basic `CREATE TABLE IF NOT EXISTS` checks.

### Migration Mechanism
1. We read the current version using `PRAGMA user_version;`.
2. We define a list of migration functions where index `i` upgrades the schema from version `i` to `i + 1`.
3. The database bootstrapper runs the required migrations sequentially in a single transaction and updates `PRAGMA user_version = X;` when done.

### Planned Schema Versions
* **Version 1 (Current baseline)**: Matches the schema in `api/db/schema.sql` (creating `tournaments`, `players`, `tournament_players`, `matches`, `time_votes`).
* **Version 2**: Adds the `match_replays` table:
  ```sql
  CREATE TABLE match_replays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    compressed_data BLOB NOT NULL, -- gzipped SC2Replay file
    parsed_data TEXT NOT NULL,      -- JSON string of all stats (chat, build order, curve data, etc.)
    winner TEXT,
    map_name TEXT,
    game_length INTEGER,            -- in seconds
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
* **Version X (Future additions)**: Any subsequent schema updates (e.g. adding new columns, indexes, or metadata tables) will be appended as new migration functions (e.g. adding a new column to `match_replays` using `ALTER TABLE match_replays ADD COLUMN ...`).

---

## 5. Implementation Roadmap

### Phase 1: Python Parser Script (`api/scripts/parse_replay.py`)
- Standard Python script executing on the server to output detailed game information (chat, build orders, curves) as JSON to `stdout`.

### Phase 2: Backend API & DB Migrations (`api/`)
- SQLite migration logic in `database.js`.
- Upload and download routes in `api/routes/replays.js`.
- Liquipedia Wiki export endpoint.

### Phase 3: Frontend UI (`web/`)
- Pre-login QQ Group verification gate screen.
- Match detail upload area + visualization dashboards for replay statistics.
- Export Liquipedia Wiki modal.

---

## 6. Testing Strategy

To verify the integration at each stage without relying on full end-to-end user actions initially:

### A. Python Parser Testing
- **Unit Test Execution**: Run the parser script directly from command line with a sample `.SC2Replay` file:
  ```bash
  python api/scripts/parse_replay.py "path/to/sample.SC2Replay"
  ```
- **Verification**: Check that output is valid JSON, contains no stack traces, and correctly populates all parsed fields (chat messages, worker count arrays, build orders).

### B. Database & API Testing
- **Migration Verification**:
  1. Boot the server and check console logs to verify database migrations run and version upgrades to 2.
  2. Query database version using SQLite CLI: `PRAGMA user_version;` (should return `2`).
- **QQ Group Validation Testing**:
  - Send request without `x-qq-group` header -> expected `400/401`.
  - Send request with incorrect QQ group -> expected `403`.
  - Send request with valid QQ group -> expected `200`.
- **Replay Upload Integration Test**:
  - Create a test script in `api/scripts/test_upload.js` that uploads a sample replay file to the `/api/matches/:matchId/replays` endpoint using `FormData`.
  - Verify that the downloaded file is binary-identical to the uploaded file (checking compression integrity).

### C. Frontend Manual/E2E Testing
- **Gate Screen Gatekeeper**: Verify clearing `localStorage` forces redirect to the QQ verification screen and blocks accessing any other route.
- **Visual Rendering**: Upload a replay and verify:
---

## 7. Agent Verification Methods (AI Pair-Programming)

When implementing these changes, the AI agent will perform the following automated test steps on the developer environment to guarantee correctness before handing over:

### A. Python parser verification
- **Method**: The agent will find a sample replay in the repo (e.g., in `sc2replay_online_analysis/sampleTest/`) and run the newly written python script with it.
- **Verification**: The agent will read and parse stdout as JSON, verifying that key structures (`chat`, `teams`, `map_name`) are properly extracted.

### B. Database Migration verification
- **Method**: The agent will create a temporary memory-based or separate test database file in `api/data/test.db`.
- **Verification**: The agent will run the database bootstrap code to verify that both Version 1 (baseline tables) and Version 2 (`match_replays` table) are successfully created sequentially, checking that the user version is updated to `2`.

### C. Backend API Integration verification
- **Method**: The agent will write a temporary Node.js script (e.g., `api/scripts/verify_api.js`) that boots the Fastify server in a test configuration, uses a node client to:
  1. Insert a mock player and tournament.
  2. Attempt uploading the sample replay (checking QQ group header validation, parsing stdout, saving BLOB).
  3. Attempt downloading the replay (ensuring Gzip decompression returns the exact original file hash).
- **Verification**: Run the validation script and inspect logs to confirm all response codes are `200 OK`.
- **Cleanup**: Delete the test database and temporary scripts.


