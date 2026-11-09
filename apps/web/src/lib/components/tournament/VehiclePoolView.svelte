<script>
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  // The event's vehicle pool as War Thunder tech-tree cards: one row per
  // Ban / Pick group (with its nation's flag), each vehicle with its wiki
  // slot picture, name and BR, linking to its wiki page. Pictures come
  // through the server's cache, the wiki itself as a fallback
  // (#lib/wt-units.js).
  import { onMount } from "svelte";
  import { rulesSummary } from "#lib/banpick.js";
  import { modesLabel } from "#lib/vehicle-pools.js";
  import { loadUnitIndex, nationFlag, poolGroups, slotImage, slotImageDirect, wikiPage } from "#lib/wt-units.js";

  let { template = null, banpickEnabled = true } = $props();

  // Units come filled in from the server; the name index loads only for
  // vehicles without one (e.g. a template being edited).
  let unitIndex = $state(null);
  onMount(() => {
    if ((template?.vehicles || []).some((v) => !v.wiki && v.unit === undefined)) loadUnitIndex().then((index) => (unitIndex = index));
  });

  let groups = $derived(poolGroups(template?.vehicles || [], unitIndex));
  let count = $derived(groups.reduce((n, g) => n + g.vehicles.length, 0));

  // Cached picture first, then the wiki, then no picture.
  function fallback(e, direct) {
    const img = e.currentTarget;
    if (direct && img.dataset.tried !== "1") {
      img.dataset.tried = "1";
      img.src = direct;
    } else img.style.visibility = "hidden";
  }
  const br = (v) => (v == null ? "" : Number(v).toFixed(1));
</script>

{#if !template}
  <EmptyState title="这场赛事没有载具池模板" hint="管理员在「载具池」页为这种比赛类型建好模板后，这里会显示可选载具。" />
{:else}
  <section class="rounded-xl border border-border bg-[#1b2128] p-3 sm:p-4 space-y-3 text-slate-100">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-sm font-bold">{template.name}</h2>
      <span class="text-small text-slate-400">{modesLabel(template.game_modes)} · {groups.length} 组 · {count} 辆</span>
    </div>
    {#if banpickEnabled}
      <p class="text-small text-slate-400">Ban / Pick：{rulesSummary(template.rules)}</p>
    {/if}

    <div class="divide-y divide-slate-700/60">
      {#each groups as g (g.group)}
        <div class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start">
          <div class="flex shrink-0 items-center gap-2 sm:w-36 sm:flex-col sm:items-start sm:gap-1">
            {#if g.nations.length === 1 && nationFlag(g.nations[0])}
              {@const flag = nationFlag(g.nations[0])}
              <img
                src={flag.cached}
                alt={g.nations[0]}
                class="h-6 w-auto rounded-sm sm:h-12"
                loading="lazy"
                onerror={(e) => fallback(e, flag.direct)}
              />
            {/if}
            <span class="text-xs font-bold leading-tight">{g.group}</span>
            <span class="text-small text-slate-400">{g.vehicles.length} 辆{g.nations.length > 1 ? ` · ${g.nations.join(" / ")}` : ""}</span>
          </div>
          <div class="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
            {#each g.vehicles as v (v.name)}
              <a
                href={v.unit ? wikiPage(v.unit) : undefined}
                target="_blank"
                rel="noopener"
                title="{v.name}{v.nation ? ` · ${v.nation}` : ''}{v.type ? ` · ${v.type}` : ''}"
                class="relative block h-[58px] overflow-hidden rounded-[3px] border border-slate-600/70 bg-gradient-to-b from-[#3a4552] to-[#262e37] shadow-sm hover:border-slate-300/70"
              >
                {#if v.unit}
                  <img
                    src={slotImage(v.unit)}
                    alt=""
                    loading="lazy"
                    class="absolute bottom-0 left-0 h-full w-[78%] object-contain object-left-bottom"
                    onerror={(e) => fallback(e, slotImageDirect(v.unit))}
                  />
                {/if}
                <span class="absolute right-1.5 top-1 max-w-[85%] truncate text-right text-small font-semibold leading-tight drop-shadow">{v.name}</span>
                {#if v.br != null}
                  <span class="absolute bottom-1 right-1.5 text-small text-slate-300 drop-shadow">{br(v.br)}</span>
                {/if}
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <p class="text-small text-slate-500">载具图片来自 War Thunder Wiki，点击卡片打开该载具的 Wiki 页面。</p>
  </section>
{/if}
