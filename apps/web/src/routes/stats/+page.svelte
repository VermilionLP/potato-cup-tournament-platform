<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { GAME_MODES, VEHICLE_POOLS } from "$lib/tournament.js";
  import Flag from "$lib/components/Flag.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import SearchIcon from "@lucide/svelte/icons/search";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import AwardIcon from "@lucide/svelte/icons/award";

  // Stats Data States
  let statsData = $state(null);
  let statsLoading = $state(true);
  let selectedStatPlayer = $state(null);
  let statsSearchQuery = $state("");
  let minMatchesFilter = $state(0); // 0 = all, 2, 5, 10

  // Sorting Control
  let statsSortField = $state("match_win_rate");
  let statsSortOrder = $state("desc");

  function handleStatsSort(field) {
    if (statsSortField === field) {
      statsSortOrder = statsSortOrder === "asc" ? "desc" : "asc";
    } else {
      statsSortField = field;
      statsSortOrder = "desc";
    }
  }

  // Derived sorted and filtered statistics list
  let sortedStatsPlayers = $derived.by(() => {
    if (!statsData?.players) return [];

    const query = statsSearchQuery.toLowerCase().trim();
    const filtered = statsData.players.filter(p => {
      const matchesSearch = p.id.toLowerCase().includes(query) ||
             p.display_name.toLowerCase().includes(query) ||
             p.team.toLowerCase().includes(query);
      const meetsMinMatches = minMatchesFilter === 0 || p.matches_played >= minMatchesFilter;
      return matchesSearch && meetsMinMatches;
    });

    return filtered.sort((a, b) => {
      let valA = a[statsSortField];
      let valB = b[statsSortField];

      if (typeof valA === "string") {
        return statsSortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return statsSortOrder === "asc" ? valA - valB : valB - valA;
    });
  });

  async function loadStats() {
    statsLoading = true;
    try {
      statsData = await API.getPlayerStatistics();
      if (statsData?.players?.length > 0) {
        const sorted = [...statsData.players].sort((a, b) => {
          if (a.matches_played < 2 && b.matches_played >= 2) return 1;
          if (b.matches_played < 2 && a.matches_played >= 2) return -1;
          return b.match_win_rate - a.match_win_rate;
        });
        selectedStatPlayer = sorted[0];
      }
    } catch (e) {
      toast.error("加载统计数据失败: " + e.message);
    }
    statsLoading = false;
  }

  onMount(loadStats);

  // ── Helpers ───────────────────────────────────────────────────────
  // Game modes: AB / RB / SB; '' = no games yet.
  const getModeCode = (m) => GAME_MODES.find((x) => x.id === m)?.code ?? "—";
  const getModeName = (m) => {
    const mode = GAME_MODES.find((x) => x.id === m);
    return mode ? `${mode.code} ${mode.name}` : "暂无对局";
  };
  const MODE_COLORS = {
    ab: { badge: "bg-sky-500/10 text-sky-400 border-sky-500/25", dot: "bg-sky-500", bar: "bg-sky-500/80" },
    rb: { badge: "bg-amber-500/10 text-amber-500 border-amber-500/25", dot: "bg-amber-500", bar: "bg-amber-500/80" },
    sb: { badge: "bg-rose-500/10 text-rose-400 border-rose-500/25", dot: "bg-rose-500", bar: "bg-rose-500/80" },
  };
  const NO_MODE = { badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/25", dot: "bg-zinc-500", bar: "bg-zinc-500/80" };
  const modeColors = (m) => MODE_COLORS[m] ?? NO_MODE;
  // Vehicle pools: 螺旋桨 / 早期喷气 / Pro League BVR.
  const POOL_COLORS = {
    prop: { dot: "bg-lime-500", bar: "bg-lime-500/80" },
    "legacy-jet": { dot: "bg-violet-500", bar: "bg-violet-500/80" },
    proleague: { dot: "bg-cyan-500", bar: "bg-cyan-500/80" },
  };

  // Flag rendering lives in $lib/components/Flag.svelte (SVG assets).

  const avatarColors = [
    "from-amber-500 to-orange-500",
    "from-purple-500 to-indigo-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-violet-500 to-fuchsia-500",
  ];

  function getGradient(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
    return avatarColors[s % avatarColors.length];
  }
</script>

<div class="space-y-6">
  <!-- Page header -->
  <div class="flex items-center justify-between border-b border-border/60 pb-5">
    <div>
      <h1 class="text-3xl font-extrabold tracking-tight bg-linear-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent">
        数据统计
      </h1>
      <p class="text-xs text-muted-foreground mt-1">
        分析赛事选手表现，挖掘趣味数据与胜率统计
      </p>
    </div>
  </div>

  {#if statsLoading}
    <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground bg-card/20 border border-border border-dashed rounded-xl">
      <div class="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      <p class="text-sm font-semibold">正在整理选手生涯战绩与趣味榜单...</p>
    </div>
  {:else}
    {#if statsData}
      <!-- Global stats cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div class="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:border-primary/20 transition-colors">
          <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <UsersIcon class="w-4 h-4" />
          </div>
          <div>
            <span class="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">参赛选手</span>
            <span class="text-lg font-black text-foreground">{statsData.global.total_players} <span class="text-xs font-normal text-muted-foreground">人</span></span>
          </div>
        </div>
        <div class="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:border-primary/20 transition-colors">
          <div class="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <TrophyIcon class="w-4 h-4" />
          </div>
          <div>
            <span class="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">举办赛事</span>
            <span class="text-lg font-black text-foreground">{statsData.global.total_tournaments} <span class="text-xs font-normal text-muted-foreground">届</span></span>
          </div>
        </div>
        <div class="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:border-primary/20 transition-colors">
          <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
            <ActivityIcon class="w-4 h-4" />
          </div>
          <div>
            <span class="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">完成对局</span>
            <span class="text-lg font-black text-foreground">{statsData.global.total_matches} <span class="text-xs font-normal text-muted-foreground">场</span></span>
          </div>
        </div>
      </div>

      <!-- Main statistics layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left + Mid: Roster Statistics Table and Detailed Profile -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div class="p-4 border-b border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/5">
              <div>
                <h3 class="text-sm font-bold text-foreground">选手表现总览</h3>
                <p class="text-[11px] text-muted-foreground mt-0.5">点击下方选手可右侧查看深度对抗数据</p>
              </div>
              <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <!-- Min matches filter -->
                <select
                  bind:value={minMatchesFilter}
                  class="h-7 text-xs rounded-md bg-muted/40 border border-border focus:border-primary/50 outline-none text-foreground px-2 pr-6 cursor-pointer shrink-0"
                >
                  <option value={0}>全部场次</option>
                  <option value={2}>≥ 2 场</option>
                  <option value={5}>≥ 5 场</option>
                  <option value={10}>≥ 10 场</option>
                </select>
                <!-- Search -->
                <div class="relative w-full sm:w-52">
                  <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
                  <input
                    type="text"
                    bind:value={statsSearchQuery}
                    placeholder="搜索选手..."
                    class="w-full pl-8 pr-3 h-7 text-xs rounded-md bg-muted/40 border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none text-foreground"
                  />
                </div>
              </div>
            </div>

            <!-- Table (desktop) -->
            <div class="hidden sm:block overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-muted/10 border-b border-border text-muted-foreground text-[10px] uppercase font-bold tracking-wider select-none">
                    <th class="py-2.5 px-3 cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors w-36" onclick={() => handleStatsSort("display_name")}>
                      <div class="flex items-center gap-1">
                        <span>选手</span>
                        {#if statsSortField === "display_name"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                    <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("main_mode")}>
                      <div class="flex items-center justify-center gap-1">
                        <span>常玩模式</span>
                        {#if statsSortField === "main_mode"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                    <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("match_win_rate")}>
                      <div class="flex items-center justify-center gap-1">
                        <span>胜率 (赛事/单局)</span>
                        {#if statsSortField === "match_win_rate"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                    <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("matches_won")}>
                      <div class="flex items-center justify-center gap-1">
                        <span>大场 (W-L)</span>
                        {#if statsSortField === "matches_won"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                    <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("maps_won")}>
                      <div class="flex items-center justify-center gap-1">
                        <span>单局 (W-L)</span>
                        {#if statsSortField === "maps_won"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                    <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("maps_played")}>
                      <div class="flex items-center justify-center gap-1">
                        <span>局数</span>
                        {#if statsSortField === "maps_played"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                    <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("tournaments_played")}>
                      <div class="flex items-center justify-center gap-1">
                        <span>参赛数</span>
                        {#if statsSortField === "tournaments_played"}
                          <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
                        {/if}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border/60">
                  {#each sortedStatsPlayers as p}
                    <tr
                      onclick={() => (selectedStatPlayer = p)}
                      class="hover:bg-muted/20 transition-colors cursor-pointer {selectedStatPlayer?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}"
                    >
                      <td class="py-2 px-3 font-semibold max-w-36">
                        <div class="flex items-center gap-1 min-w-0">
                           <Flag code={p.flag} size={18} />
                           {#if p.team}
                             <span class="text-[9px] text-muted-foreground font-bold font-mono shrink-0">[{p.team}]</span>
                           {/if}
                           <span class="truncate">{p.display_name}</span>
                        </div>
                      </td>
                      <td class="py-2 px-2 text-center">
                        <Badge variant="outline" class="text-[9px] px-1 py-0 uppercase tracking-wider {modeColors(p.main_mode).badge}" title={getModeName(p.main_mode)}>
                          {getModeCode(p.main_mode)}
                        </Badge>
                      </td>
                      <td class="py-2 px-2 text-center font-mono font-bold">
                        <div class="flex items-center justify-center gap-1">
                          <span class="{p.match_win_rate >= 0.6 ? 'text-emerald-500' : p.match_win_rate <= 0.4 ? 'text-rose-500/80' : 'text-foreground'}">
                            {Math.round(p.match_win_rate * 100)}%
                          </span>
                          <span class="text-muted-foreground font-normal">/</span>
                          <span class="text-muted-foreground/80 font-normal">
                            {Math.round(p.map_win_rate * 100)}%
                          </span>
                        </div>
                      </td>
                      <td class="py-2 px-2 text-center font-mono text-muted-foreground">
                        <span class="font-bold text-foreground">{p.matches_won}</span> - {p.matches_lost}
                      </td>
                      <td class="py-2 px-2 text-center font-mono text-muted-foreground">
                        <span class="font-bold text-foreground">{p.maps_won}</span> - {p.maps_lost}
                      </td>
                      <td class="py-2 px-2 text-center font-mono font-bold text-muted-foreground">
                        {p.maps_played}
                      </td>
                      <td class="py-2 px-2 text-center font-mono font-bold text-muted-foreground">
                        {p.tournaments_played}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <!-- Mobile player list -->
            <div class="sm:hidden divide-y divide-border/60">
              {#each sortedStatsPlayers as p}
                <button
                  type="button"
                  onclick={() => (selectedStatPlayer = p)}
                  class="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer
                    {selectedStatPlayer?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/20'}"
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <Flag code={p.flag} size={18} />
                      {#if p.team}
                        <span class="text-[9px] text-muted-foreground font-bold font-mono shrink-0">[{p.team}]</span>
                      {/if}
                      <span class="truncate font-semibold text-sm">{p.display_name}</span>
                      <Badge variant="outline" class="text-[9px] px-1 py-0 uppercase tracking-wider shrink-0 {modeColors(p.main_mode).badge}" title={getModeName(p.main_mode)}>
                        {getModeCode(p.main_mode)}
                      </Badge>
                    </div>
                    <div class="text-[10px] text-muted-foreground mt-1 font-mono truncate">
                      {Math.round(p.match_win_rate * 100)}% / {Math.round(p.map_win_rate * 100)}%
                      · 大场 {p.matches_won}-{p.matches_lost}
                      · 单局 {p.maps_won}-{p.maps_lost}
                      · {p.tournaments_played} 届
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="font-mono font-black text-sm
                      {p.match_win_rate >= 0.6 ? 'text-emerald-500' : p.match_win_rate <= 0.4 ? 'text-rose-500/80' : 'text-foreground'}">
                      {Math.round(p.match_win_rate * 100)}%
                    </div>
                    <div class="text-[9px] text-muted-foreground">胜率</div>
                  </div>
                </button>
              {/each}
              {#if sortedStatsPlayers.length === 0}
                <div class="py-10 text-center text-xs text-muted-foreground italic">没有匹配的选手。</div>
              {/if}
            </div>
          </div>

          <!-- Selected Player Detail Card -->
          {#if selectedStatPlayer}
            <div class="bg-card border border-border rounded-xl shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow relative overflow-hidden">
              <div class="absolute right-0 top-0 w-24 h-24 bg-linear-to-br from-primary/10 to-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
              
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
                <div class="flex items-center gap-3">
                  <div data-no-i18n class="w-12 h-12 rounded-xl bg-linear-to-br {getGradient(selectedStatPlayer.id)} flex items-center justify-center text-base font-black text-white uppercase shadow-inner shadow-black/10">
                    {selectedStatPlayer.display_name.slice(0, 2)}
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-base font-extrabold text-foreground">{selectedStatPlayer.display_name}</h3>
                      <Flag code={selectedStatPlayer.flag} size={18} />
                      <Badge variant="outline" class="text-[9px] px-1.5 py-0 tracking-wider {modeColors(selectedStatPlayer.main_mode).badge}" title="最常参加的游戏模式">
                        {getModeName(selectedStatPlayer.main_mode)}
                      </Badge>
                    </div>
                    <p class="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      ID: {selectedStatPlayer.id} {#if selectedStatPlayer.team}· 战队: [{selectedStatPlayer.team}]{/if}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-6">
                  <div class="text-center sm:text-right">
                    <span class="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">赛事胜率</span>
                    <span class="text-xl font-black text-primary font-mono">{Math.round(selectedStatPlayer.match_win_rate * 100)}%</span>
                  </div>
                  <div class="text-center sm:text-right border-l border-border/60 pl-6">
                    <span class="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">单局胜率</span>
                    <span class="text-xl font-black text-foreground font-mono">{Math.round(selectedStatPlayer.map_win_rate * 100)}%</span>
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
                      {@const rec = selectedStatPlayer.modes?.[mode.id]}
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
                      {@const rec = selectedStatPlayer.pools?.[pool.id]}
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
                      {#if selectedStatPlayer.nemesis}
                        <div class="mt-1.5 p-2 rounded bg-red-500/5 border border-red-500/10 flex justify-between items-center text-xs">
                          <span class="font-bold text-foreground">{selectedStatPlayer.nemesis.display_name}</span>
                          <span class="font-mono text-rose-400">输过 <span class="font-bold">{selectedStatPlayer.nemesis.count}</span> 次大场</span>
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
                      {#if selectedStatPlayer.favorite}
                        <div class="mt-1.5 p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex justify-between items-center text-xs">
                          <span class="font-bold text-foreground">{selectedStatPlayer.favorite.display_name}</span>
                          <span class="font-mono text-emerald-400">赢过 <span class="font-bold">{selectedStatPlayer.favorite.count}</span> 次大场</span>
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
                      <span class="text-xs font-mono font-bold text-emerald-400">{selectedStatPlayer.walkover_wins} 次</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] text-muted-foreground">放人鸽子 (自身弃权)</span>
                      <span class="text-xs font-mono font-bold text-rose-500">{selectedStatPlayer.walkover_losses} 次</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Participated Tournaments -->
              {#if selectedStatPlayer.tournaments?.length > 0}
                <div class="border-t border-border/50 pt-4 space-y-2">
                  <h4 class="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <TrophyIcon class="w-3.5 h-3.5 text-amber-500" />
                    参加过的赛事
                  </h4>
                  <div class="flex flex-wrap gap-1.5">
                    {#each selectedStatPlayer.tournaments as t}
                      <a
                        href="/tournament/{encodeURIComponent(t.id)}"
                        class="text-[10px] px-2 py-1 rounded-md bg-muted/30 border border-border/60 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors font-mono truncate max-w-48"
                        title={t.name}
                      >{t.name}</a>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Right: Rankings & Boards -->
        <div class="space-y-6">
          <!-- Board 1: Championships -->
          <div class="bg-card border border-border rounded-xl p-4.5 shadow-sm space-y-4">
            <h3 class="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TrophyIcon class="w-4 h-4 text-amber-500" />
              最强战力榜 (冠军次数)
            </h3>
            <div class="space-y-3">
              {#each statsData.rankings.by_championships || [] as p, idx (p.id)}
                <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
                    <Flag code={p.flag} size={18} />
                    <span class="font-bold truncate max-w-28">{p.display_name}</span>
                  </div>
                  <span class="font-mono font-black text-amber-500">{p.championships} <span class="text-[9px] font-normal text-muted-foreground">次冠军</span></span>
                </div>
              {/each}
              {#if !statsData.rankings.by_championships?.length}
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
              {#each statsData.rankings.by_win_rate as p, idx (p.id)}
                <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
                    <Flag code={p.flag} size={18} />
                    <span class="font-bold truncate max-w-28">{p.display_name}</span>
                  </div>
                  <span class="font-mono font-black text-emerald-500">{Math.round(p.match_win_rate * 100)}% <span class="text-[9px] font-normal text-muted-foreground">({p.matches_won}/{p.matches_played})</span></span>
                </div>
              {/each}
              {#if statsData.rankings.by_win_rate.length === 0}
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
              {#each statsData.rankings.by_played as p, idx}
                <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
                    <Flag code={p.flag} size={18} />
                    <span class="font-bold truncate max-w-28">{p.display_name}</span>
                  </div>
                  <span class="font-mono font-black text-blue-400">{p.matches_played} <span class="text-[9px] font-normal text-muted-foreground">场</span></span>
                </div>
              {/each}
              {#if statsData.rankings.by_played.length === 0}
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
              {#each statsData.rankings.by_walkover as p, idx}
                <div class="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/40 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>
                    <Flag code={p.flag} size={18} />
                    <span class="font-bold truncate max-w-28">{p.display_name}</span>
                  </div>
                  <span class="font-mono font-black text-purple-400">{p.walkover_losses} <span class="text-[9px] font-normal text-muted-foreground">次</span></span>
                </div>
              {/each}
              {#if statsData.rankings.by_walkover.length === 0}
                <div class="text-center py-4 text-[10px] text-muted-foreground italic">暂无弃权排行</div>
              {/if}
            </div>
          </div>

        </div>
      </div>
    {/if}
  {/if}
</div>
