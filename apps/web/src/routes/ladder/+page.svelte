<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import MmrChart from "$lib/components/ladder/mmr-chart.svelte";
  import { formatWinRate, daysAgo } from "$lib/ladder.js";
  import TierBadge from "$lib/components/TierBadge.svelte";

  let data = $state(null);
  let loading = $state(true);
  let errorMsg = $state("");
  let query = $state("");
  let includeInactive = $state(false);
  let chartMode = $state("time");
  let selected = $state(null);
  let detail = $state(null);
  let detailLoading = $state(false);

  const flagEmoji = (f) =>
    ({
      cn: "🇨🇳",
      hk: "🇭🇰",
      tw: "🇹🇼",
      us: "🇺🇸",
      kr: "🇰🇷",
      eu: "🇪🇺",
    })[f] || "🏳️";

  let filteredPlayers = $derived.by(() => {
    const players = data?.players || [];
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.display_name || "").toLowerCase().includes(q) ||
        (p.team || "").toLowerCase().includes(q),
    );
  });

  let myRank = $derived(
    userState.id
      ? (data?.players || []).find((p) => p.id === userState.id)
      : null,
  );

  let topPlayer = $derived(data?.players?.[0] || null);

  onMount(load);

  async function load() {
    loading = true;
    errorMsg = "";
    try {
      data = await API.getLadder({ includeInactive });
      if (selected && !data?.players?.some((p) => p.id === selected.id)) {
        selected = null;
        detail = null;
      }
      if (!selected && data?.players?.length) {
        await selectPlayer(data.players[0]);
      }
    } catch (e) {
      errorMsg = e.message;
      toast.error("加载天梯数据失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function toggleInactive(event) {
    includeInactive = event.target.checked;
    selected = null;
    detail = null;
    await load();
  }

  async function selectPlayer(player) {
    if (selected?.id === player.id) return;
    selected = player;
    detail = null;
    detailLoading = true;
    try {
      detail = await API.getLadderPlayer(player.id);
    } catch (e) {
      toast.error("加载选手天梯记录失败: " + e.message);
    } finally {
      detailLoading = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <TrendingUpIcon class="w-6 h-6 text-primary" />
      <h1 class="text-2xl font-extrabold tracking-tight">天梯 MMR</h1>
    </div>
    <p class="text-xs text-muted-foreground">
      所有已完成的赛事对局按 Elo 计算，经典 SUCK（败者晋级）也计入；初始
      MMR 3000。默认只显示近 {data?.active_days || 365} 天有对局的选手；分数不重置，
      回归后沿用原分。种子默认按这里的 MMR 自动排序。
    </p>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      <span class="text-xs">正在计算天梯分...</span>
    </div>
  {:else if errorMsg}
    <div class="text-center py-16 border border-border bg-card/30 rounded-2xl">
      <p class="text-sm text-rose-400">加载失败：{errorMsg}</p>
    </div>
  {:else}
    <!-- Summary -->
    <div class="grid grid-cols-3 gap-2 sm:gap-4">
      <Card.Root class="border-border bg-card/40">
        <Card.Content class="p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div class="hidden sm:flex w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 items-center justify-center">
            <SwordsIcon class="w-4 h-4 text-primary" />
          </div>
          <div>
            <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{includeInactive ? "已定级选手" : "活跃选手"}</div>
            <div class="text-lg sm:text-xl font-extrabold font-mono">{data?.players?.length || 0}</div>
          </div>
        </Card.Content>
      </Card.Root>
      <Card.Root class="border-border bg-card/40">
        <Card.Content class="p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div class="hidden sm:flex w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 items-center justify-center">
            <CrownIcon class="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">天梯第一</div>
            <div class="text-xs sm:text-sm font-bold truncate max-w-24 sm:max-w-40">
              {topPlayer ? `${topPlayer.display_name} · ${topPlayer.mmr}` : "—"}
            </div>
          </div>
        </Card.Content>
      </Card.Root>
      <Card.Root class="border-border bg-card/40">
        <Card.Content class="p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div class="hidden sm:flex w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 items-center justify-center">
            <TrendingUpIcon class="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">我的排名</div>
            <div class="text-xs sm:text-sm font-bold">
              {#if myRank}
                #{myRank.rank} · {myRank.mmr}
              {:else}
                未上榜
              {/if}
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </div>

    <Card.Root class="border-border bg-card/40">
      <Card.Header class="p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Card.Title class="text-base font-bold flex items-center gap-2">
            <TrophyIcon class="w-4 h-4 text-amber-500" />
            排行榜
          </Card.Title>
          <Card.Description class="text-[11px]">
            段位按 LoTV 官方百分位（大师 4%、钻石/白金/黄金/白银各 23%、青铜 4%）；大段内按名次分 I/II/III；宗师为区域前 200，小池子不设。
          </Card.Description>
        </div>
        <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <label class="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onchange={toggleInactive}
              class="accent-primary"
            />
            显示不活跃
          </label>
          <div class="relative w-full sm:w-56">
            <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input bind:value={query} placeholder="搜索选手 / 战队" class="pl-8 h-8 text-xs" />
          </div>
        </div>
      </Card.Header>
      <Card.Content class="p-0">
        <div class="hidden sm:block overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/20">
                <th class="py-2.5 px-3 text-center w-12">#</th>
                <th class="py-2.5 px-3">选手</th>
                <th class="py-2.5 px-2 text-center">段位</th>
                <th class="py-2.5 px-2 text-center">MMR</th>
                <th class="py-2.5 px-2 text-center">场次</th>
                <th class="py-2.5 px-2 text-center">胜 - 负</th>
                <th class="py-2.5 px-2 text-center">胜率</th>
                <th class="py-2.5 px-2 text-center">最近对局</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/60">
              {#each filteredPlayers as p (p.id)}
                <tr
                  onclick={() => selectPlayer(p)}
                  class="hover:bg-muted/20 transition-colors cursor-pointer
                    {selected?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}
                    {userState.id === p.id ? 'bg-primary/5' : ''}"
                >
                  <td class="py-2.5 px-3 text-center font-mono font-bold">
                    {#if p.rank === 1}
                      <span class="text-amber-400">1</span>
                    {:else if p.rank === 2}
                      <span class="text-zinc-300">2</span>
                    {:else if p.rank === 3}
                      <span class="text-amber-700">3</span>
                    {:else}
                      <span class="text-muted-foreground">{p.rank}</span>
                    {/if}
                  </td>
                  <td class="py-2.5 px-3 font-semibold max-w-52">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <span class="text-sm shrink-0">{flagEmoji(p.flag)}</span>
                      {#if p.team}
                        <span class="text-[9px] text-muted-foreground font-bold font-mono shrink-0">[{p.team}]</span>
                      {/if}
                      <span class="truncate">{p.display_name}</span>
                      {#if p.provisional}
                        <span class="text-[9px] text-muted-foreground/70 shrink-0">定级中</span>
                      {/if}
                      {#if p.active === false}
                        <span class="text-[9px] text-amber-500/80 shrink-0">不活跃</span>
                      {/if}
                    </div>
                  </td>
                  <td class="py-2.5 px-2 text-center">
                    <TierBadge tier={p.tier} />
                  </td>
                  <td class="py-2.5 px-2 text-center font-mono font-black text-sm">{p.mmr}</td>
                  <td class="py-2.5 px-2 text-center font-mono text-muted-foreground">{p.games}</td>
                  <td class="py-2.5 px-2 text-center font-mono text-muted-foreground">
                    <span class="font-bold text-foreground">{p.wins}</span> - {p.losses}
                  </td>
                  <td class="py-2.5 px-2 text-center font-mono font-bold
                    {p.win_rate >= 0.6 ? 'text-emerald-500' : p.win_rate <= 0.4 ? 'text-rose-500/80' : 'text-foreground'}">
                    {formatWinRate(p.win_rate)}
                  </td>
                  <td class="py-2.5 px-2 text-center font-mono text-[10px] text-muted-foreground">
                    {daysAgo(p.last_game_at)}
                  </td>
                </tr>
              {/each}
              {#if filteredPlayers.length === 0}
                <tr>
                  <td colspan="8" class="py-10 text-center text-xs text-muted-foreground italic">
                    暂无天梯记录。完成一场赛事对局后就会自动计入。
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>

        <!-- Mobile card list -->
        <div class="sm:hidden divide-y divide-border/60">
          {#each filteredPlayers as p (p.id)}
            <button
              type="button"
              onclick={() => selectPlayer(p)}
              class="w-full text-left px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer
                {selected?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/20'}"
            >
              <span class="w-6 shrink-0 text-center font-mono font-bold
                {p.rank === 1 ? 'text-amber-400' : p.rank === 2 ? 'text-zinc-400' : p.rank === 3 ? 'text-amber-700' : 'text-muted-foreground'}">
                {p.rank}
              </span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-sm shrink-0">{flagEmoji(p.flag)}</span>
                  {#if p.team}
                    <span class="text-[9px] text-muted-foreground font-bold font-mono shrink-0">[{p.team}]</span>
                  {/if}
                  <span class="truncate font-semibold text-sm">{p.display_name}</span>
                  {#if p.provisional}
                    <span class="text-[9px] text-muted-foreground/70 shrink-0">定级中</span>
                  {/if}
                  {#if p.active === false}
                    <span class="text-[9px] text-amber-500/80 shrink-0">不活跃</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5 mt-1 min-w-0">
                  <TierBadge tier={p.tier} className="shrink-0" />
                  <span class="text-[10px] font-mono text-muted-foreground truncate">
                    {p.games} 场 · {p.wins}-{p.losses} · {formatWinRate(p.win_rate)}
                  </span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="font-mono font-black text-sm">{p.mmr}</div>
                <div class="text-[9px] text-muted-foreground">{daysAgo(p.last_game_at)}</div>
              </div>
            </button>
          {/each}
          {#if filteredPlayers.length === 0}
            <div class="py-10 text-center text-xs text-muted-foreground italic">
              暂无天梯记录。完成一场赛事对局后就会自动计入。
            </div>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Selected player detail -->
    {#if selected}
      <Card.Root class="border-border bg-card/40">
        <Card.Header class="p-5 pb-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="text-2xl">{flagEmoji(selected.flag)}</div>
              <div>
                <div class="text-base font-bold flex items-center gap-2 flex-wrap">
                  {selected.display_name}
                  <TierBadge tier={selected.tier} />
                  {#if selected.active === false}
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 border-amber-500/30 bg-amber-500/10 text-amber-500">
                      不活跃
                    </Badge>
                  {/if}
                </div>
                <div class="text-[10px] text-muted-foreground">
                  排名 #{selected.rank} · {selected.games} 场 · {selected.wins} 胜 {selected.losses} 负
                </div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">MMR</div>
              <div class="text-2xl font-black font-mono">{selected.mmr}</div>
            </div>
          </div>
        </Card.Header>
        <Card.Content class="p-5 pt-0 space-y-4">
          {#if detailLoading}
            <div class="py-6 text-center text-xs text-muted-foreground">加载对局记录...</div>
          {:else if detail?.history?.length}
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                MMR 历史 · 共 {detail.history.length} 场
              </div>
              <div class="flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/40 p-0.5">
                <button
                  type="button"
                  onclick={() => (chartMode = "time")}
                  class="px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer
                    {chartMode === 'time' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
                >
                  按时间
                </button>
                <button
                  type="button"
                  onclick={() => (chartMode = "game")}
                  class="px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer
                    {chartMode === 'game' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
                >
                  按场次
                </button>
              </div>
            </div>
            <div class="rounded-xl border border-border/60 bg-background/30 px-2 pt-2 pb-1">
              <MmrChart history={detail.history} mode={chartMode} />
            </div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              最近对局（全部）
            </div>
            <div class="space-y-1.5 max-h-80 overflow-y-auto">
              {#each detail.history as h (h.game_id + "-" + h.player_id)}
                <div class="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
                  <span class="w-5 text-center font-black {h.won ? 'text-emerald-500' : 'text-rose-500'}">
                    {h.won ? "W" : "L"}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="truncate font-semibold">
                      {h.opponent_name}
                      <span class="text-muted-foreground font-normal">
                        ({h.score_for}-{h.score_against})
                      </span>
                      <span class="hidden sm:inline text-[9px] text-muted-foreground/75 font-normal ml-1.5">
                        对手 {h.opponent_mmr}
                      </span>
                    </div>
                    <div class="sm:hidden text-[9px] text-muted-foreground truncate">
                      对手 {h.opponent_mmr} · {h.tournament_name}
                    </div>
                  </div>
                  <span class="hidden sm:block text-[10px] text-muted-foreground truncate max-w-40">
                    {h.tournament_name}
                  </span>
                  <span class="font-mono font-bold {h.mmr_delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
                    {h.mmr_delta >= 0 ? "+" : ""}{h.mmr_delta}
                  </span>
                  <span class="font-mono text-[10px] text-muted-foreground w-12 text-right">{h.mmr_after}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="py-6 text-center text-xs text-muted-foreground italic">暂无对局记录。</div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}

    <p class="text-[10px] text-muted-foreground/70">
      Elo：初始 3000，前 10 场 K=200（同分对局 ±100），10–30 场 K=100，30 场以后 K=50；2-0 与 2-1 同权。
      只有已完成的赛事对局计入，弃权/平局不计。活跃窗口 {data?.active_days || 365} 天；
      不活跃选手移出榜单，但分数保留，回归后继续使用。
    </p>
  {/if}
</div>
