<script>
  // An event's 比赛地图 (its 载具池 and 说明 tabs): picture cards with the
  // main settings and the room link. The maps are the ones set for the event,
  // else those of its vehicle pool template (GET /tournaments/:id/missions).
  // Admins can set the event's own list or go back to the template's.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MissionCard from "./MissionCard.svelte";
  import MissionHowTo from "./MissionHowTo.svelte";
  import MissionThumb from "./MissionThumb.svelte";
  import MapIcon from "@lucide/svelte/icons/map";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";

  let { tournament } = $props();

  let isAdmin = $derived(!!userState.adminToken);
  let data = $state(null); // { source, pool, event_missions, missions }
  let all = $state([]);
  let editing = $state(false);
  let draft = $state([]);
  let saving = $state(false);

  async function load() {
    try {
      data = await API.getEventMissions(tournament.id);
    } catch {
      data = null;
    }
  }
  // Again when the event or its template changes.
  let loadedFor = "";
  $effect(() => {
    const key = `${tournament?.id}|${tournament?.vehicle_template}|${tournament?.vehicle_pool}|${tournament?.game_mode}|${isAdmin}`;
    if (!tournament?.id || key === loadedFor) return;
    loadedFor = key;
    load();
  });

  async function startEdit() {
    if (!all.length) all = (await API.getMissions().catch(() => ({ missions: [] }))).missions || [];
    draft = [...(data?.source === "event" ? data.event_missions : data?.missions.map((m) => m.id) || [])];
    editing = true;
  }
  const byId = $derived(new Map(all.map((m) => [m.id, m])));
  function toggle(id) {
    draft = draft.includes(id) ? draft.filter((x) => x !== id) : [...draft, id];
  }
  function up(i) {
    const next = [...draft];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    draft = next;
  }
  async function save(list) {
    saving = true;
    try {
      await API.setEventMissions(tournament.id, list);
      editing = false;
      await load();
      toast.success(list.length ? "已更新本场比赛地图" : "已改回使用载具池的地图");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }

  const sourceText = $derived(
    !data ? "" : data.source === "event" ? "本场指定的地图" : data.source === "pool" ? `来自载具池「${data.pool.name}」` : "",
  );
</script>

{#if data && (data.missions.length || isAdmin)}
  <section class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><MapIcon class="size-4" /></span>
      <h3 class="text-base font-bold">比赛地图</h3>
      {#if sourceText}<span class="text-small text-muted-foreground">{sourceText}</span>{/if}
      <span class="ml-auto flex items-center gap-2">
        <a href="/maps" class="text-small font-semibold text-muted-foreground hover:text-foreground">全部地图</a>
        {#if isAdmin && !editing}
          <Button size="sm" variant="outline" onclick={startEdit}><PencilIcon class="size-3.5" />选择地图</Button>
        {/if}
      </span>
    </div>

    {#if editing}
      <div class="space-y-3 rounded-xl border border-border bg-card p-3.5">
        {#if !all.length}
          <p class="text-sm text-muted-foreground">还没有比赛地图。<a href="/maps" class="font-semibold text-brand-ink hover:underline">去添加地图</a></p>
        {:else}
          <p class="text-small text-muted-foreground">勾选这场比赛用的地图，按选中的顺序显示（最多 10 张）。不勾选任何地图 = 使用载具池模板的地图。</p>
          <ul class="divide-y divide-border rounded-lg border border-border">
            {#each [...draft.map((id) => byId.get(id)).filter(Boolean), ...all.filter((m) => !draft.includes(m.id))] as m (m.id)}
              {@const at = draft.indexOf(m.id)}
              <li class="flex items-center gap-2.5 px-2.5 py-1.5">
                <input type="checkbox" class="size-4 accent-primary" checked={at >= 0} onchange={() => toggle(m.id)} id="em-{m.id}" />
                <MissionThumb mission={m} class="w-16 shrink-0 rounded" />
                <label for="em-{m.id}" class="min-w-0 flex-1 truncate text-sm font-semibold" data-no-i18n>{m.name}</label>
                {#if at > 0}<button type="button" class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" title="上移" onclick={() => up(at)}><ArrowUpIcon class="size-3.5" /></button>{/if}
              </li>
            {/each}
          </ul>
          <div class="flex flex-wrap justify-end gap-2">
            {#if data.source === "event" && data.pool?.missions?.length}
              <Button size="sm" variant="ghost" onclick={() => save([])} disabled={saving}>改回使用载具池的地图</Button>
            {/if}
            <Button size="sm" variant="outline" onclick={() => (editing = false)}>取消</Button>
            <Button size="sm" onclick={() => save(draft)} disabled={saving}>保存</Button>
          </div>
        {/if}
      </div>
    {:else if data.missions.length}
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each data.missions as m (m.id)}<MissionCard mission={m} compact />{/each}
      </div>
      <details class="group">
        <summary class="cursor-pointer select-none text-small font-semibold text-brand-ink/90 hover:text-brand-ink">怎么用链接开房</summary>
        <MissionHowTo class="mt-2" />
      </details>
    {:else}
      <p class="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">这场比赛还没有地图：在载具池模板里选地图，或者点「选择地图」为本场指定。</p>
    {/if}
  </section>
{/if}
