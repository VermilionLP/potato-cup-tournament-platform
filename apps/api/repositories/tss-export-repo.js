// Saved Liquipedia export settings of TSS tournaments (axsuck.tss_exports,
// migration 059). The TSS data itself is read live (lib/tss/client.js).

export function TssExportRepo(db) {
  return {
    async get(tssId) {
      const r = await db.query('SELECT tss_id, name, solo, settings, updated_at FROM axsuck.tss_exports WHERE tss_id = $1', [String(tssId)]);
      return r.rows[0] || null;
    },

    /** The most recently saved settings of an event of the same kind (1v1 or teams). */
    async latestOfKind(solo, exceptId) {
      const r = await db.query(
        `SELECT settings FROM axsuck.tss_exports
         WHERE solo = $1 AND tss_id <> $2
         ORDER BY updated_at DESC LIMIT 1`,
        [Boolean(solo), String(exceptId)],
      );
      return r.rows[0]?.settings || null;
    },

    async recent(limit = 20) {
      const r = await db.query(
        'SELECT tss_id, name, solo, updated_at FROM axsuck.tss_exports ORDER BY updated_at DESC LIMIT $1',
        [limit],
      );
      return r.rows;
    },

    async save(tssId, { name, solo, settings, updatedBy }) {
      await db.query(
        `INSERT INTO axsuck.tss_exports (tss_id, name, solo, settings, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (tss_id) DO UPDATE
           SET name = EXCLUDED.name, solo = EXCLUDED.solo, settings = EXCLUDED.settings,
               updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [String(tssId), String(name || '').slice(0, 200), Boolean(solo), JSON.stringify(settings), updatedBy || null],
      );
    },
  };
}
