-- Player profiles used to store Battle.net tags as
--   battle_tags = '{"cn": ["Bnet#1234"], "global": ["Bnet#9012"]}'
-- The profile forms now collect a QQ number and a Discord user name instead.
--
-- This migration copies the first entry of each old list into the new keys
-- and keeps any remaining entries under "legacy" so nothing is silently
-- dropped. Rows that already carry qq/discord (or unparsable JSON) are left
-- untouched, which makes the migration safe to re-run.
DO $$
DECLARE
  rec RECORD;
  raw JSONB;
  cn_list JSONB;
  global_list JSONB;
  cn_entries TEXT[];
  global_entries TEXT[];
  payload JSONB;
BEGIN
  FOR rec IN SELECT id, battle_tags FROM axsuck.players LOOP
    CONTINUE WHEN rec.battle_tags IS NULL OR btrim(rec.battle_tags) = '';

    BEGIN
      raw := rec.battle_tags::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    CONTINUE WHEN raw IS NULL OR jsonb_typeof(raw) <> 'object';
    CONTINUE WHEN raw ? 'qq' OR raw ? 'discord';

    cn_list := CASE jsonb_typeof(raw -> 'cn')
      WHEN 'array' THEN raw -> 'cn'
      WHEN 'string' THEN jsonb_build_array(raw -> 'cn')
      ELSE '[]'::jsonb
    END;
    global_list := CASE jsonb_typeof(raw -> 'global')
      WHEN 'array' THEN raw -> 'global'
      WHEN 'string' THEN jsonb_build_array(raw -> 'global')
      ELSE '[]'::jsonb
    END;

    SELECT COALESCE(array_agg(value ORDER BY ord), '{}'::text[])
      INTO cn_entries
      FROM jsonb_array_elements_text(cn_list) WITH ORDINALITY AS t(value, ord)
     WHERE btrim(value) <> '';

    SELECT COALESCE(array_agg(value ORDER BY ord), '{}'::text[])
      INTO global_entries
      FROM jsonb_array_elements_text(global_list) WITH ORDINALITY AS t(value, ord)
     WHERE btrim(value) <> '';

    payload := jsonb_build_object(
      'qq', NULLIF(btrim(cn_entries[1]), ''),
      'discord', NULLIF(btrim(global_entries[1]), '')
    );

    IF array_length(cn_entries, 1) > 1 OR array_length(global_entries, 1) > 1 THEN
      payload := payload || jsonb_build_object(
        'legacy', jsonb_build_object(
          'cn', to_jsonb(cn_entries),
          'global', to_jsonb(global_entries)
        )
      );
    END IF;

    UPDATE axsuck.players
       SET battle_tags = jsonb_strip_nulls(payload)::text
     WHERE id = rec.id;
  END LOOP;
END $$;
