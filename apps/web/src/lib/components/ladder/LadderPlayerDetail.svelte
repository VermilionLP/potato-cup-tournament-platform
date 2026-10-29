<script>
  // A ladder player: tier, rank and record, the MMR chart (by time or by
  // game) and their rated games, newest first.
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import MmrChart from "$lib/components/ladder/mmr-chart.svelte";
  import TierBadge from "$lib/components/TierBadge.svelte";
  import Flag from "$lib/components/Flag.svelte";
  import { formatWinRate, daysAgo } from "$lib/ladder.js";

  let { player, detail = null, detailLoading = false } = $props();
  let chartMode = $state("time");
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="text-2xl"><Flag code={player.flag} size={32} /></div>
        <div>
          <div class="text-base font-bold flex items-center gap-2 flex-wrap">
            {player.display_name}
            <TierBadge tier={player.tier} />
            {#if player.active === false}
              <Badge variant="outline" class="text-[9px] px-1.5 py-0 border-amber-500/30 bg-amber-500/10 text-amber-500">
                不活跃
              </Badge>
            {/if}
          </div>
          <div class="text-[10px] text-muted-foreground">
            排名 #{player.rank} · {player.games} 场 · {player.wins} 胜 {player.losses} 负
          </div>
        </div>
      </div>
      <div class="text-right">
        <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">MMR</div>
        <div class="text-2xl font-black font-mono">{player.mmr}</div>
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
