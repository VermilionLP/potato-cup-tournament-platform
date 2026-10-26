-- Restores the old Battle.net tag shape from the QQ/Discord contact fields.
-- When "legacy" survived the forward migration it wins, because it still has
-- the complete original lists.
DO $$
DECLARE
  rec RECORD;
  raw JSONB;
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
    CONTINUE WHEN NOT (raw ? 'qq' OR raw ? 'discord');

    payload := jsonb_build_object(
      'cn', CASE
        WHEN COALESCE(btrim(raw ->> 'qq'), '') <> '' THEN jsonb_build_array(btrim(raw ->> 'qq'))
        ELSE '[]'::jsonb
      END,
      'global', CASE
        WHEN COALESCE(btrim(raw ->> 'discord'), '') <> '' THEN jsonb_build_array(btrim(raw ->> 'discord'))
        ELSE '[]'::jsonb
      END
    );

    IF raw ? 'legacy' THEN
      payload := jsonb_build_object(
        'cn', COALESCE(raw -> 'legacy' -> 'cn', payload -> 'cn'),
        'global', COALESCE(raw -> 'legacy' -> 'global', payload -> 'global')
      );
    END IF;

    UPDATE axsuck.players
       SET battle_tags = payload::text
     WHERE id = rec.id;
  END LOOP;
END $$;
