<script>
  // Ban / Pick numbers on the statistics page (GET /banpick/stats): for one
  // event type at a time, the most banned groups, the vehicles played most
  // and the ones removed (redrawn) most. Hidden while there is no data.
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { API } from "#lib/api.js";
  import { vehiclePoolLabel } from "#lib/tournament.js";
  import BanIcon from "@lucide/svelte/icons/ban";
  import CarIcon from "@lucide/svelte/icons/car-front";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";

  let { tier = "", kind = "" } = $props();
  let data = $state(null);
  let type = $state("");
  let loading = $state(true);

  $effect(() => {
    const scope = { tier, kind, type };
    loading = true;
    API.getBanpickStats(scope)
      .then((d) => {
        data = d;
        if (!type && d?.type) type = d.type;
      })
      .catch(() => (data = null))
      .finally(() => (loading = false));
  });

  const boards = $derived(
    data
      ? [
          { key: "banned", title: "最常被禁的大组", icon: BanIcon, tone: "text-rose-500", rows: data.groups.banned, value: (r) => r.bans, unit: "次禁用", rate: true },
          { key: "played", title: "出场最多的载具", icon: CarIcon, tone: "text-amber-500", rows: data.vehicles.played, value: (r) => r.played, unit: "场", sub: (r) => r.group },
          { key: "removed", title: "最常被移出重抽", icon: ShuffleIcon, tone: "text-sky-500", rows: data.vehicles.removed, value: (r) => r.removed, unit: "次", sub: (r) => r.group },
        ]
      : [],
  );
  const pct = (n) => (data?.matches ? `${Math.round((n / data.matches) * 100)}%` : "");
</script>

{#if data && data.types.length}
  <section class="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-black tracking-tight">载具统计</h2>
        <p class="text-small text-muted-foreground">
          {data.matches} 场 Ban/Pick · {data.confirmed} 场已确认载具（撤销的步骤不计）
        </p>
      </div>
      {#if data.types.length > 1}
        <div class="flex flex-wrap gap-1">
          {#each data.types as t (t.type)}
            <button
              type="button"
              onclick={() => (type = t.type)}
              class="rounded-full border px-2.5 py-0.5 text-small font-semibold transition-colors cursor-pointer
                {t.type === data.type ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}"
            >
              {vehiclePoolLabel(t.type) || t.type || "未分类"} · {t.matches}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="grid gap-3 md:grid-cols-3 {loading ? 'opacity-60' : ''}">
      {#each boards as b (b.key)}
        <div class="rounded-lg border border-border/60 bg-muted/10 p-3">
          <h3 class="mb-2 flex items-center gap-1.5 text-xs font-bold">
            <b.icon class="h-3.5 w-3.5 {b.tone}" />{b.title}
          </h3>
          {#if b.rows.length}
            <ol class="space-y-1">
              {#each b.rows.slice(0, 5) as r, i (r.name)}
                {@const max = b.value(b.rows[0]) || 1}
                <li class="relative overflow-hidden rounded-md px-2 py-1 text-xs">
                  <span class="absolute inset-y-0 left-0 rounded-md bg-primary/10" style="width: {(b.value(r) / max) * 100}%"></span>
                  <span class="relative flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <span class="w-3 shrink-0 num text-small text-muted-foreground">{i + 1}</span>
                      <span class="truncate font-semibold">{r.name}</span>
                      {#if b.sub?.(r)}<span class="shrink-0 text-small text-muted-foreground">{b.sub(r)}</span>{/if}
                    </span>
                    <span class="shrink-0 num text-small font-bold">
                      {b.value(r)}<span class="ml-0.5 font-sans text-small font-normal text-muted-foreground">{b.unit}</span>
                      {#if b.rate}<span class="ml-1 text-small font-normal text-muted-foreground">{pct(b.value(r))}</span>{/if}
                    </span>
                  </span>
                </li>
              {/each}
            </ol>
          {:else}
            <EmptyState compact title="暂无数据" />
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}
