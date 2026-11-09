<script>
  // The statistics page's 载具 tab (GET /banpick/stats): for one event type
  // at a time, summary numbers, every group (bans, ban rate, drawn, played),
  // every played vehicle with its share, and the players who ban most with
  // their favourite bans. Undone steps are not counted.
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { StatTile } from "#lib/components/ui/stat-tile/index.js";
  import { Chip } from "#lib/components/ui/chip/index.js";
  import { TAG_BASE, TAG_TONE } from "#lib/tags.js";
  import { API } from "#lib/api.js";
  import { vehiclePoolLabel } from "#lib/tournament.js";
  import BanIcon from "@lucide/svelte/icons/ban";
  import CarIcon from "@lucide/svelte/icons/car-front";
  import UserXIcon from "@lucide/svelte/icons/user-x";

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

  const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
  let groups = $derived(data?.groups?.table || []);
  let vehicles = $derived(data?.vehicles?.table || []);
  let banners = $derived(data?.banners || []);
  let maxBans = $derived(Math.max(1, ...groups.map((g) => g.bans)));
  let maxPlayed = $derived(Math.max(1, ...vehicles.map((v) => v.played)));
  let topBanned = $derived(groups.find((g) => g.bans > 0));
</script>

{#if loading && !data}
  <p class="py-10 text-center text-small text-muted-foreground">正在整理载具统计…</p>
{:else if !data || !data.types.length}
  <EmptyState title="还没有 Ban/Pick 数据" hint="开启了 Ban/Pick 的比赛打完后，这里会统计禁用和出场的载具" />
{:else}
  <div class="space-y-5 {loading ? 'opacity-60' : ''}">
    <!-- Event type -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-small text-muted-foreground">
        按比赛类型分开统计；撤销的步骤不计。
      </p>
      {#if data.types.length > 1}
        <div class="flex flex-wrap gap-2" role="group" aria-label="比赛类型">
          {#each data.types as t (t.type)}
            <Chip selected={t.type === data.type} count={t.matches} onclick={() => (type = t.type)}>{vehiclePoolLabel(t.type) || t.type || "未分类"}</Chip>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="BP Matches" value={data.matches} note="场 Ban/Pick" />
      <StatTile label="Confirmed" value={data.confirmed} note="场已确认载具" />
      <StatTile label="Bans / Match" value={data.matches ? (data.bans / data.matches).toFixed(1) : "0"} note="场均禁用{data.passes ? ` · ${data.passes} 次空过` : ''}" />
      <StatTile label="Most Banned" value={topBanned?.name || "—"} tone="loss" note={topBanned ? `禁用率 ${pct(topBanned.bans, data.matches)}%` : "暂无禁用"} valueClass="truncate" />
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <!-- Every group -->
      <section class="rounded-xl border border-border bg-card p-4">
        <h3 class="mb-3 flex items-center gap-1.5 text-body font-bold"><BanIcon class="h-4 w-4 text-loss" />大组禁用与出场</h3>
        {#if groups.length}
          <div class="overflow-x-auto">
            <table class="w-full text-small">
              <thead>
                <tr class="border-b border-border text-left text-muted-foreground">
                  <th class="py-2 pr-2 font-semibold">大组</th>
                  <th class="py-2 pr-2 font-semibold">禁用</th>
                  <th class="py-2 pr-2 text-right font-semibold" title="Ban/Pick 中被抽中的次数">抽中</th>
                  <th class="py-2 text-right font-semibold" title="最终确认为本场大组的次数">出场</th>
                </tr>
              </thead>
              <tbody>
                {#each groups as g (g.name)}
                  <tr class="border-b border-border/60 last:border-0">
                    <td class="py-2 pr-2 font-semibold">{g.name}</td>
                    <td class="w-1/2 py-2 pr-2">
                      <div class="flex items-center gap-2">
                        <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div class="h-full rounded-full bg-loss/70" style="width: {(g.bans / maxBans) * 100}%"></div>
                        </div>
                        <span class="num w-16 shrink-0 text-right font-bold">{g.bans}<span class="ml-1 font-normal text-muted-foreground">{pct(g.bans, data.matches)}%</span></span>
                      </div>
                    </td>
                    <td class="num py-2 pr-2 text-right">{g.drawn || "—"}</td>
                    <td class="num py-2 text-right font-bold">{g.played || "—"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <EmptyState compact title="暂无数据" />
        {/if}
      </section>

      <!-- Every played vehicle -->
      <section class="rounded-xl border border-border bg-card p-4">
        <h3 class="mb-3 flex items-center gap-1.5 text-body font-bold"><CarIcon class="h-4 w-4 text-brand-ink" />载具出场</h3>
        {#if vehicles.length}
          <div class="overflow-x-auto">
            <table class="w-full text-small">
              <thead>
                <tr class="border-b border-border text-left text-muted-foreground">
                  <th class="py-2 pr-2 font-semibold">载具</th>
                  <th class="py-2 pr-2 font-semibold">大组</th>
                  <th class="py-2 font-semibold">出场</th>
                </tr>
              </thead>
              <tbody>
                {#each vehicles as v, i (v.name)}
                  <tr class="border-b border-border/60 last:border-0">
                    <td class="py-2 pr-2">
                      <span class="num mr-1.5 inline-block w-4 text-muted-foreground">{i + 1}</span><span class="font-semibold">{v.name}</span>
                    </td>
                    <td class="py-2 pr-2 text-muted-foreground">{v.group || "—"}</td>
                    <td class="w-2/5 py-2">
                      <div class="flex items-center gap-2">
                        <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div class="h-full rounded-full bg-primary" style="width: {(v.played / maxPlayed) * 100}%"></div>
                        </div>
                        <span class="num w-16 shrink-0 text-right font-bold">{v.played}<span class="ml-1 font-normal text-muted-foreground">{pct(v.played, data.confirmed)}%</span></span>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <EmptyState compact title="还没有确认的载具" />
        {/if}
      </section>
    </div>

    <!-- Who bans what -->
    <section class="rounded-xl border border-border bg-card p-4">
      <h3 class="mb-3 flex items-center gap-1.5 text-body font-bold"><UserXIcon class="h-4 w-4 text-muted-foreground" />选手禁用偏好</h3>
      {#if banners.length}
        <ol class="grid gap-2 md:grid-cols-2">
          {#each banners as b, i (b.id)}
            <li class="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-small">
              <span class="num w-5 shrink-0 text-muted-foreground">{i + 1}</span>
              <a href="/player/{encodeURIComponent(b.id)}" class="min-w-0 flex-1 truncate font-bold hover:text-brand-ink">{b.id}</a>
              <span class="flex shrink-0 flex-wrap justify-end gap-1">
                {#each b.top as t (t.group)}
                  <span class="{TAG_BASE} {TAG_TONE.neutral}">{t.group} ×{t.n}</span>
                {/each}
              </span>
              <span class="num w-14 shrink-0 text-right font-bold">{b.bans}<span class="ml-0.5 font-sans font-normal text-muted-foreground">次</span></span>
            </li>
          {/each}
        </ol>
      {:else}
        <EmptyState compact title="还没有禁用记录" />
      {/if}
    </section>
  </div>
{/if}
