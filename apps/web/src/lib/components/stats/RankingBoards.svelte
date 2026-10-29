<script>
  // Top-five boards: titles (with titles per tier), win rate (5+ matches),
  // matches played and walkovers.
  import Flag from "$lib/components/Flag.svelte";
  import { TIER_TAG, tierBreakdown } from "$lib/tournament.js";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";

  let { rankings } = $props();
</script>

<div class="space-y-6">
  <!-- Board 1: Championships -->
  <div class="bg-card border border-border rounded-xl p-4.5 shadow-sm space-y-4">
    <h3 class="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
      <TrophyIcon class="w-4 h-4 text-amber-500" />
      最强战力榜 (冠军次数)
    </h3>
    <div class="space-y-3">
      {#each rankings.by_championships || [] as p, idx (p.id)}
        <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
            <Flag code={p.flag} size={18} />
            <span class="font-bold truncate max-w-28">{p.display_name}</span>
          </div>
          <div class="flex flex-col items-end gap-0.5">
            <span class="font-mono font-black text-amber-500">{p.championships} <span class="text-[9px] font-normal text-muted-foreground">次冠军</span></span>
            <span class="flex flex-wrap justify-end gap-0.5">
              {#each tierBreakdown(p.championships_by_tier) as t (t.id)}
                <span class="rounded border px-1 text-[9px] font-bold leading-tight {TIER_TAG[t.id] || 'border-border text-muted-foreground'}">{t.id === "none" ? "未分级" : t.id} ×{t.count}</span>
              {/each}
            </span>
          </div>
        </div>
      {/each}
      {#if !rankings.by_championships?.length}
        <div class="text-center py-4 text-[10px] text-muted-foreground italic">暂无冠军记录</div>
      {/if}
    </div>
  </div>

  <!-- Board 2: Win Rate Ranking -->
  <div class="bg-card border border-border rounded-xl p-4.5 shadow-sm space-y-4">
    <h3 class="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
      <TrendingUpIcon class="w-4 h-4 text-emerald-500" />
      胜率榜 (胜率)
    </h3>
    <div class="space-y-3">
      {#each rankings.by_win_rate as p, idx (p.id)}
        <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
            <Flag code={p.flag} size={18} />
            <span class="font-bold truncate max-w-28">{p.display_name}</span>
          </div>
          <span class="font-mono font-black text-emerald-500">{Math.round(p.match_win_rate * 100)}% <span class="text-[9px] font-normal text-muted-foreground">({p.matches_won}/{p.matches_played})</span></span>
        </div>
      {/each}
      {#if rankings.by_win_rate.length === 0}
        <div class="text-center py-4 text-[10px] text-muted-foreground italic">暂无胜率排行（至少 5 场）</div>
      {/if}
    </div>
  </div>

  <!-- Board 3: Matches Played Ranking -->
  <div class="bg-card border border-border rounded-xl p-4.5 shadow-sm space-y-4">
    <h3 class="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
      <ActivityIcon class="w-4 h-4 text-blue-500" />
      劳模战士榜 (局数)
    </h3>
    <div class="space-y-3">
      {#each rankings.by_played as p, idx}
        <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
            <Flag code={p.flag} size={18} />
            <span class="font-bold truncate max-w-28">{p.display_name}</span>
          </div>
          <span class="font-mono font-black text-blue-400">{p.matches_played} <span class="text-[9px] font-normal text-muted-foreground">场</span></span>
        </div>
      {/each}
      {#if rankings.by_played.length === 0}
        <div class="text-center py-4 text-[10px] text-muted-foreground italic">暂无场数排行</div>
      {/if}
    </div>
  </div>

  <!-- Board 4: Walkovers Ranking -->
  <div class="bg-card border border-border rounded-xl p-4.5 shadow-sm space-y-4">
    <h3 class="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
      <ShieldAlertIcon class="w-4 h-4 text-purple-500" />
      和平鸽子王 (弃权)
    </h3>
    <div class="space-y-3">
      {#each rankings.by_walkover as p, idx}
        <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
            <Flag code={p.flag} size={18} />
            <span class="font-bold truncate max-w-28">{p.display_name}</span>
          </div>
          <span class="font-mono font-black text-purple-400">{p.walkover_losses} <span class="text-[9px] font-normal text-muted-foreground">次</span></span>
        </div>
      {/each}
      {#if rankings.by_walkover.length === 0}
        <div class="text-center py-4 text-[10px] text-muted-foreground italic">暂无弃权排行</div>
      {/if}
    </div>
  </div>

</div>
