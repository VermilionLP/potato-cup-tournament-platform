<script>
  // A vehicle pool template's 比赛地图: the maps its events use (an event can
  // still set its own on its 载具池 tab). Admins tick and order them; others
  // see the cards.
  import { onMount } from "svelte";
  import { API } from "#lib/api.js";
  import MissionThumb from "#lib/components/maps/MissionThumb.svelte";
  import MapIcon from "@lucide/svelte/icons/map";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import XIcon from "@lucide/svelte/icons/x";

  let { selected = [], isAdmin = false, onchange } = $props();

  let all = $state([]);
  let loaded = $state(false);
  onMount(async () => {
    try {
      all = (await API.getMissions()).missions || [];
    } catch {
      all = [];
    } finally {
      loaded = true;
    }
  });

  const byId = $derived(new Map(all.map((m) => [m.id, m])));
  const chosen = $derived(selected.map((id) => byId.get(id)).filter(Boolean));
  const others = $derived(all.filter((m) => !selected.includes(m.id)));

  const set = (list) => onchange?.(list);
  const add = (id) => set([...selected, id]);
  const drop = (id) => set(selected.filter((x) => x !== id));
  function up(i) {
    const next = [...selected];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    set(next);
  }
</script>

{#if isAdmin || chosen.length}
  <section class="space-y-2.5 rounded-lg border border-border/60 bg-background/60 p-3.5">
    <div class="flex items-center gap-2">
      <MapIcon class="size-4 text-brand-ink" />
      <h3 class="label-caps text-muted-foreground">比赛地图</h3>
      <span class="text-small text-muted-foreground">用这个模板的赛事会显示这些地图（赛事可以另外指定）</span>
      <a href="/maps" class="ml-auto text-small font-semibold text-brand-ink hover:underline">全部地图</a>
    </div>

    {#if chosen.length}
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {#each chosen as m, i (m.id)}
          <li class="flex items-center gap-2.5 rounded-lg border border-border bg-card p-1.5 pr-2">
            <MissionThumb mission={m} class="w-24 shrink-0 rounded-md" />
            <a href="/maps/{m.id}" class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold" data-no-i18n>{m.name}</span>
              {#if m.location}<span class="block truncate text-small text-muted-foreground" data-no-i18n>{m.location}</span>{/if}
            </a>
            {#if isAdmin}
              {#if i > 0}<button type="button" class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" title="上移" onclick={() => up(i)}><ArrowUpIcon class="size-3.5" /></button>{/if}
              <button type="button" class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-loss cursor-pointer" title="移除" onclick={() => drop(m.id)}><XIcon class="size-3.5" /></button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if loaded}
      <p class="text-small text-muted-foreground">还没有选地图。</p>
    {/if}

    {#if isAdmin}
      {#if others.length}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-small text-muted-foreground">添加：</span>
          {#each others as m (m.id)}
            <button type="button" class="rounded-md border border-dashed border-border px-2 py-0.5 text-small font-semibold hover:border-primary hover:text-brand-ink cursor-pointer" onclick={() => add(m.id)} data-no-i18n>+ {m.name}</button>
          {/each}
        </div>
      {:else if loaded && !all.length}
        <p class="text-small text-muted-foreground">还没有比赛地图。<a href="/maps" class="font-semibold text-brand-ink hover:underline">去添加地图</a></p>
      {/if}
    {/if}
  </section>
{/if}
