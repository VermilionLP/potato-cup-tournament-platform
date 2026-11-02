<script>
  // Admin: which vehicle pool template the event's Ban / Pick uses, at the
  // top of the 载具池 tab: automatic (the best match for the event type and
  // game mode, $lib/vehicle-pools.js resolveTemplate) or a chosen one.
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { resolveTemplate } from "$lib/vehicle-pools.js";
  import { vehiclePoolLabel } from "$lib/tournament.js";

  let { tournament = $bindable(), tid, templates = [], bpTemplate = null } = $props();

  let typeTemplates = $derived(templates.filter((t) => t.event_type === tournament?.vehicle_pool));
  let autoTemplate = $derived(resolveTemplate(templates, { ...tournament, vehicle_template: null }));
  let saving = $state(false);

  async function save(id) {
    if (id === (tournament?.vehicle_template || "")) return;
    saving = true;
    try {
      const res = await API.updateTournament(tid, { vehicle_template: id || null });
      tournament = { ...tournament, vehicle_template: res.vehicle_template ?? null };
      toast.success(id ? "已指定载具池模板" : "载具池模板改为自动匹配");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
  <span class="font-semibold text-primary">管理员 · Ban / Pick 载具池模板</span>
  <select
    aria-label="载具池模板"
    value={tournament?.vehicle_template || ""}
    disabled={saving}
    onchange={(e) => save(e.currentTarget.value)}
    class="h-7 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground cursor-pointer disabled:opacity-60"
  >
    <option value="">自动（{autoTemplate?.name || "无"}）</option>
    {#if tournament?.vehicle_template && !typeTemplates.some((t) => t.id === tournament.vehicle_template)}
      <option value={tournament.vehicle_template}>{bpTemplate?.name || tournament.vehicle_template}</option>
    {/if}
    {#each typeTemplates as t (t.id)}
      <option value={t.id}>{t.name}</option>
    {/each}
  </select>
  <span class="text-muted-foreground">只列出「{vehiclePoolLabel(tournament?.vehicle_pool)}」类型的模板</span>
  <a href={bpTemplate ? `/pools?template=${encodeURIComponent(bpTemplate.id)}` : "/pools"} class="ml-auto text-primary hover:underline">编辑模板 →</a>
</div>
