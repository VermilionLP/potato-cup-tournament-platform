<script>
  // Admin: seed order before the bracket is drawn (ladder MMR by default).
  import { gameModeInfo, vehiclePoolLabel } from "$lib/tournament.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import TierBadge from "$lib/components/TierBadge.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";

  let { tournament, seedOrder = [], playerName, onauto, onrandom, onmove } = $props();
  let playersById = $derived(new Map((tournament.players || []).map((p) => [p.id, p])));
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-6">
    <div>
      <Card.Title class="text-base font-bold flex items-center gap-2">
        <CrownIcon class="w-5 h-5 text-amber-500" />
        种子排序配置
      </Card.Title>
      <Card.Description class="text-xs">
        默认按天梯 MMR 自动排序：高种子在前，空出的轮次优先轮空高种子。手动调整或随机微调后会切换为手动模式。
      </Card.Description>
      <p class="text-[10px] text-muted-foreground">
        使用 {gameModeInfo(tournament.game_mode).code}{vehiclePoolLabel(tournament.vehicle_pool) ? ` ${vehiclePoolLabel(tournament.vehicle_pool)}` : ""} 分榜 MMR；没有该分榜对局的选手不显示 MMR，排在最后。
      </p>
      <div class="mt-2">
        <Badge variant="outline" class="text-[9px] px-1.5 py-0 uppercase tracking-wider
          {tournament.seed_mode === 'manual' ? 'border-amber-500/30 bg-amber-500/10 text-amber-500' : 'border-primary/30 bg-primary/10 text-primary'}">
          {tournament.seed_mode === "manual" ? "手动模式" : "自动按天梯排序"}
        </Badge>
      </div>
    </div>
  </Card.Header>
  <Card.Content class="p-6 pt-0 space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onclick={onauto} class="h-7 text-[10px] cursor-pointer gap-1">
        <RefreshCwIcon class="w-3 h-3" />
        按天梯分重排
      </Button>
      <Button variant="outline" size="sm" onclick={onrandom} class="h-7 text-[10px] cursor-pointer gap-1">
        <ShuffleIcon class="w-3 h-3" />
        随机微调
      </Button>
      <span class="text-[10px] text-muted-foreground">随机只打乱 MMR 相近的选手，前 2 / 后 2 名不动</span>
    </div>
    <div class="space-y-1.5 max-h-75 overflow-y-auto pr-1">
      {#each seedOrder as pid, idx (pid)}
        {@const p = playersById.get(pid)}
        <div class="flex items-center gap-3 bg-background/50 border border-border rounded-xl px-4 py-2 text-xs">
          <span class="text-amber-500 font-bold w-6">#{idx + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{playerName(pid)}</div>
            <div class="flex items-center gap-1.5 mt-0.5">
              <TierBadge tier={p?.ladder_tier} className="text-[9px]" />
              {#if p?.ladder_games}
                <span class="text-[9px] font-mono text-muted-foreground">{p.ladder_mmr} MMR · {p.ladder_games} 场</span>
              {/if}
              {#if p?.ladder_active === false}
                <span class="text-[9px] text-amber-500/80">不活跃</span>
              {/if}
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <Button variant="ghost" size="icon-xs" onclick={() => onmove(idx, -1)} disabled={idx === 0} class="h-6 w-6 cursor-pointer">&uarr;</Button>
            <Button variant="ghost" size="icon-xs" onclick={() => onmove(idx, 1)} disabled={idx === seedOrder.length - 1} class="h-6 w-6 cursor-pointer">&darr;</Button>
          </div>
        </div>
      {/each}
    </div>
  </Card.Content>
</Card.Root>
