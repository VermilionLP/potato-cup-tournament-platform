<script>
  // One player's statistics: win rates, record per mode and event type,
  // rivals, walkovers, titles by event tier and the events they played.
  import Flag from "$lib/components/Flag.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { GAME_MODES, TIER_TAG, VEHICLE_POOLS, tierBreakdown } from "$lib/tournament.js";
  import { POOL_COLORS, getGradient, getModeName, modeColors, placeClass, placeText } from "$lib/stats-view.js";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import AwardIcon from "@lucide/svelte/icons/award";

  let { player } = $props();
</script>

<div class="bg-card border border-border rounded-xl shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow relative overflow-hidden">
  <div class="absolute right-0 top-0 w-24 h-24 bg-linear-to-br from-primary/10 to-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
  
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
    <div class="flex items-center gap-3">
      <div data-no-i18n class="w-12 h-12 rounded-xl bg-linear-to-br {getGradient(player.id)} flex items-center justify-center text-base font-black text-white uppercase shadow-inner shadow-black/10">
        {player.display_name.slice(0, 2)}
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-base font-extrabold text-foreground">{player.display_name}</h3>
          <Flag code={player.flag} size={18} />
          <Badge variant="outline" class="text-[9px] px-1.5 py-0 tracking-wider {modeColors(player.main_mode).badge}" title="最常参加的游戏模式">
            {getModeName(player.main_mode)}
          </Badge>
        </div>
        <p class="text-[10px] text-muted-foreground mt-0.5 font-mono">
          ID: {player.id} {#if player.team}· 战队: [{player.team}]{/if}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-6">
      <div class="text-center sm:text-right">
        <span class="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">赛事胜率</span>
        <span class="text-xl font-black text-primary font-mono">{Math.round(player.match_win_rate * 100)}%</span>
      </div>
      <div class="text-center sm:text-right border-l border-border/60 pl-6">
        <span class="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">单局胜率</span>
        <span class="text-xl font-black text-foreground font-mono">{Math.round(player.map_win_rate * 100)}%</span>
      </div>
    </div>
  </div>

  <!-- Grid stats details -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Column 1: record per game mode -->
    <div class="space-y-3 bg-muted/5 border border-border/40 p-3.5 rounded-xl">
      <h4 class="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1">
        <TrendingUpIcon class="w-3.5 h-3.5 text-primary" />
        模式战绩 (单局)
      </h4>
      <div class="space-y-2.5">
        {#each GAME_MODES as mode (mode.id)}
          {@const rec = player.modes?.[mode.id]}
          {@const maps = rec ? rec.maps_won + rec.maps_lost : 0}
          {@const rate = maps > 0 ? rec.maps_won / maps : 0}
          <div class="space-y-1">
            <div class="flex justify-between gap-2 text-[10px]">
              <span class="font-bold flex items-center gap-1 min-w-0">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 {modeColors(mode.id).dot}"></span>
                {mode.code}
                <span class="font-normal text-muted-foreground truncate">{mode.name}</span>
              </span>
              <span class="font-mono text-muted-foreground shrink-0">
                {#if rec && rec.matches_won + rec.matches_lost > 0}
                  <span class="pr-1" title="大场胜-负">{rec.matches_won}-{rec.matches_lost}</span>
                {/if}
                {rec ? rec.maps_won : 0}/{maps}局
                <span class="font-bold text-foreground pl-1">{Math.round(rate * 100)}%</span>
              </span>
            </div>
            <div class="h-1.5 bg-muted/65 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all {modeColors(mode.id).bar}" style="width: {rate * 100}%"></div>
            </div>
          </div>
        {/each}
        <div class="mt-1 pt-2 border-t border-border/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">比赛类型</div>
        {#each VEHICLE_POOLS as pool (pool.id)}
          {@const rec = player.pools?.[pool.id]}
          {@const maps = rec ? rec.maps_won + rec.maps_lost : 0}
          {@const rate = maps > 0 ? rec.maps_won / maps : 0}
          <div class="space-y-1">
            <div class="flex justify-between gap-2 text-[10px]">
              <span class="font-bold flex items-center gap-1 min-w-0">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 {POOL_COLORS[pool.id].dot}"></span>
                <span class="truncate">{pool.name}</span>
              </span>
              <span class="font-mono text-muted-foreground shrink-0">
                {#if rec && rec.matches_won + rec.matches_lost > 0}
                  <span class="pr-1" title="大场胜-负">{rec.matches_won}-{rec.matches_lost}</span>
                {/if}
                {rec ? rec.maps_won : 0}/{maps}局
                <span class="font-bold text-foreground pl-1">{Math.round(rate * 100)}%</span>
              </span>
            </div>
            <div class="h-1.5 bg-muted/65 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all {POOL_COLORS[pool.id].bar}" style="width: {rate * 100}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Column 2: Social/Rivals -->
    <div class="space-y-3 bg-muted/5 border border-border/40 p-3.5 rounded-xl">
      <h4 class="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1">
        <UsersIcon class="w-3.5 h-3.5 text-primary" />
        宿命对抗关系
      </h4>
      <div class="space-y-3.5 pt-1">
        <div>
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-rose-400 font-bold flex items-center gap-1">
              <ShieldAlertIcon class="w-3.5 h-3.5" />
              一生之敌 (Nemesis)
            </span>
          </div>
          {#if player.nemesis}
            <div class="mt-1.5 p-2 rounded bg-red-500/5 border border-red-500/10 flex justify-between items-center text-xs">
              <span class="font-bold text-foreground">{player.nemesis.display_name}</span>
              <span class="font-mono text-rose-400">输过 <span class="font-bold">{player.nemesis.count}</span> 次大场</span>
            </div>
          {:else}
            <div class="mt-1.5 text-muted-foreground/50 text-[10px] italic">暂无宿敌</div>
          {/if}
        </div>
        <div>
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-emerald-400 font-bold flex items-center gap-1">
              <AwardIcon class="w-3.5 h-3.5" />
              提款机 (Favorite)
            </span>
          </div>
          {#if player.favorite}
            <div class="mt-1.5 p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex justify-between items-center text-xs">
              <span class="font-bold text-foreground">{player.favorite.display_name}</span>
              <span class="font-mono text-emerald-400">赢过 <span class="font-bold">{player.favorite.count}</span> 次大场</span>
            </div>
          {:else}
            <div class="mt-1.5 text-muted-foreground/50 text-[10px] italic">暂无提款机</div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Column 3: Fun Facts / Playtime -->
    <div class="space-y-3 bg-muted/5 border border-border/40 p-3.5 rounded-xl">
      <h4 class="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1">
        <ClockIcon class="w-3.5 h-3.5 text-primary" />
        选手趣味花边
      </h4>
      <div class="space-y-2.5 pt-1">
        <div class="flex items-center justify-between border-b border-border/40 pb-2">
          <span class="text-[10px] text-muted-foreground">不战而胜 (对手弃权)</span>
          <span class="text-xs font-mono font-bold text-emerald-400">{player.walkover_wins} 次</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-muted-foreground">放人鸽子 (自身弃权)</span>
          <span class="text-xs font-mono font-bold text-rose-500">{player.walkover_losses} 次</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Titles by event tier -->
  {#if player.championships > 0}
    <div class="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-4 text-xs">
      <span class="inline-flex items-center gap-1 font-extrabold text-foreground">
        <TrophyIcon class="w-3.5 h-3.5 text-amber-500" />
        冠军 ×{player.championships}
      </span>
      {#each tierBreakdown(player.championships_by_tier) as t (t.id)}
        <span class="rounded-md border px-1.5 py-0.5 text-[11px] font-bold {TIER_TAG[t.id] || 'border-border bg-muted/60 text-muted-foreground'}">{t.name} ×{t.count}</span>
      {/each}
    </div>
  {/if}

  <!-- Participated Tournaments -->
  {#if player.tournaments?.length > 0}
    <div class="border-t border-border/50 pt-4 space-y-2">
      <h4 class="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1.5">
        <TrophyIcon class="w-3.5 h-3.5 text-amber-500" />
        参加过的赛事
      </h4>
      <div class="flex flex-wrap gap-1.5">
        {#each player.tournaments as t}
          <a
            href="/tournament/{encodeURIComponent(t.id)}"
            class="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-muted/30 border border-border/60 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors font-mono max-w-56"
            title={t.place ? `${t.name} · ${placeText(t.place)}` : t.name}
          >
            <span class="truncate">{t.name}</span>
            {#if t.place}
              <span class="shrink-0 rounded border px-1 text-[9px] font-bold font-sans {placeClass(t.place)}">
                {#if t.place.from === 1 && t.place.to === 1}🏆 {/if}{placeText(t.place)}
              </span>
            {/if}
          </a>
        {/each}
      </div>
    </div>
  {/if}
</div>
