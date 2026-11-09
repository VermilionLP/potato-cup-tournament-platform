<script>
  // Statistics filter: event tier and kind ("" = all, "none" = not set).
  // The page reloads the statistics for the choice.
  import { EVENT_KINDS, EVENT_TIERS } from "#lib/tournament.js";
  import { FilterBar, FilterGroup } from "#lib/components/ui/filter-group/index.js";

  let { tier = "", kind = "", disabled = false, onchange } = $props();
  const tierOptions = [{ id: "", label: "全部" }, ...EVENT_TIERS.map((t) => ({ id: t.id, label: t.id, title: t.name })), { id: "none", label: "未分级" }];
  const kindOptions = [{ id: "", label: "全部" }, ...EVENT_KINDS.map((k) => ({ id: k.id, label: k.name }))];
</script>

<FilterBar>
  <FilterGroup label="等级" value={tier} {disabled} onpick={(id) => onchange?.(id, kind)} options={tierOptions} />
  <FilterGroup label="性质" value={kind} {disabled} onpick={(id) => onchange?.(tier, id)} options={kindOptions} />
</FilterBar>
