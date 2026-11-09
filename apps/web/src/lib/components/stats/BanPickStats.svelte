<script>
  // The statistics page's 载具 tab (GET /banpick/stats): for one event type
  // at a time, every group (bans, ban rate, drawn, played), every played
  // vehicle with its share, and every player who bans with their favourite
  // bans. Undone steps are not counted.
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import ShowMoreRows from "#lib/components/ShowMoreRows.svelte";
  import { PAGE_SIZE } from "#lib/expand-row.js";
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
  // Who bans what: the first page, then "显示更多".
  let bannerLimit = $state(PAGE_SIZE);
  let shownBanners = $derived(banners.slice(0, bannerLimit));
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

    <!-- Who bans what: every player who banned in this type -->
    <section class="overflow-hidden rounded-xl border border-border bg-card">
      <div class="p-4 pb-2">
        <h3 class="flex items-center gap-1.5 text-body font-bold"><UserXIcon class="h-4 w-4 text-muted-foreground" />选手禁用偏好</h3>
        <p class="text-small text-muted-foreground">每位选手禁用过的次数和最常禁的大组</p>
      </div>
      {#if banners.length}
        <div class="overflow-x-auto">
          <table class="w-full text-small">
            <thead>
              <tr class="border-y border-border bg-muted/50 text-left text-muted-foreground">
                <th class="w-10 py-2 pl-4 font-semibold">#</th>
                <th class="py-2 pr-3 font-semibold">选手</th>
                <th class="py-2 pr-3 text-right font-semibold">禁用</th>
                <th class="py-2 pr-3 text-right font-semibold" title="有禁用记录的 Ban/Pick 场数">场次</th>
                <th class="py-2 pr-4 font-semibold">最常禁的大组</th>
              </tr>
            </thead>
            <tbody>
              {#each shownBanners as b, i (b.id)}
                <tr class="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td class="num py-2 pl-4 text-muted-foreground">{i + 1}</td>
                  <td class="py-2 pr-3"><a href="/player/{encodeURIComponent(b.id)}" class="font-bold hover:text-brand-ink">{b.id}</a></td>
                  <td class="num py-2 pr-3 text-right font-bold">{b.bans}</td>
                  <td class="num py-2 pr-3 text-right text-muted-foreground">{b.matches}</td>
                  <td class="py-2 pr-4">
                    <span class="flex flex-wrap gap-1">
                      {#each b.top as t, j (t.group)}
                        <span class="{TAG_BASE} {j === 0 ? TAG_TONE.brand : TAG_TONE.neutral}">{t.group} ×{t.n}</span>
                      {/each}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <ShowMoreRows shown={shownBanners.length} total={banners.length} onmore={() => (bannerLimit = shownBanners.length + PAGE_SIZE)} onall={() => (bannerLimit = Infinity)} />
      {:else}
        <div class="p-4 pt-0"><EmptyState compact title="还没有禁用记录" /></div>
      {/if}
    </section>

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

  </div>
{/if}
