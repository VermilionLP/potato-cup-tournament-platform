<script>
  // Ladder division: game mode × event type ("" = all), e.g. AB 螺旋桨.
  import { GAME_MODES, VEHICLE_POOLS } from "#lib/tournament.js";
  import { FilterBar, FilterGroup } from "#lib/components/ui/filter-group/index.js";

  let { mode = "", pool = "", onchange } = $props();
</script>

<FilterBar>
  <FilterGroup label="模式" value={mode} onpick={(id) => onchange(id, pool)} options={[{ id: "", label: "全部" }, ...GAME_MODES.map((m) => ({ id: m.id, label: m.code, title: m.name }))]} />
  <FilterGroup label="类型" value={pool} onpick={(id) => onchange(mode, id)} options={[{ id: "", label: "全部" }, ...VEHICLE_POOLS.map((p) => ({ id: p.id, label: p.name }))]} />
</FilterBar>
