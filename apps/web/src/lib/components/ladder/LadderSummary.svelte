<script>
  // Ladder summary: players shown, the leader and the viewer's rank.
  import * as Card from "$lib/components/ui/card/index.js";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import CrownIcon from "@lucide/svelte/icons/crown";

  let { count = 0, includeInactive = false, topPlayer = null, myRank = null } = $props();
</script>

<div class="grid grid-cols-3 gap-2 sm:gap-4">
  <Card.Root class="border-border bg-card/40">
    <Card.Content class="p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3">
      <div class="hidden sm:flex w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 items-center justify-center">
        <SwordsIcon class="w-4 h-4 text-primary" />
      </div>
      <div>
        <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{includeInactive ? "已定级选手" : "活跃选手"}</div>
        <div class="text-lg sm:text-xl font-extrabold font-mono">{count}</div>
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
