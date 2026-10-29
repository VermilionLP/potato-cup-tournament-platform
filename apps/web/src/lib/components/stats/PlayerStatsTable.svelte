<script>
  // Every player's record: search, minimum matches, inactive / unrated
  // toggles and sortable columns (desktop table, mobile list). Clicking a
  // player selects them for the detail card.
  import Flag from "$lib/components/Flag.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { tierBreakdown } from "$lib/tournament.js";
  import { getModeCode, getModeName, modeColors, placeText } from "$lib/stats-view.js";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let { players = [], selected = $bindable(null) } = $props();

  let statsSearchQuery = $state("");
  let minMatchesFilter = $state(0); // 0 = all, 2, 5, 10
  // As on the ladder: hide players with no rated game in the last year, and
  // players with no rated game at all (未定级), unless asked for.
  let showInactive = $state(false);
  let showUnrated = $state(false);

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
    if (!players) return [];

    const query = statsSearchQuery.toLowerCase().trim();
    const filtered = players.filter(p => {
      const matchesSearch = p.id.toLowerCase().includes(query) ||
             p.display_name.toLowerCase().includes(query) ||
             p.team.toLowerCase().includes(query);
      const meetsMinMatches = minMatchesFilter === 0 || p.matches_played >= minMatchesFilter;
      const meetsActivity = (showInactive || p.active !== false) && (showUnrated || p.rated !== false);
      return matchesSearch && meetsMinMatches && meetsActivity;
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
</script>

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
      <label class="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer select-none whitespace-nowrap" title="显示近 365 天没有对局的选手">
        <input type="checkbox" bind:checked={showInactive} class="accent-primary" />
        显示不活跃
      </label>
      <label class="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer select-none whitespace-nowrap" title="显示没有任何计分对局的选手">
        <input type="checkbox" bind:checked={showUnrated} class="accent-primary" />
        显示未定级
      </label>
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
          <th class="py-2.5 px-2 text-center cursor-pointer hover:bg-muted/20 hover:text-foreground transition-colors" onclick={() => handleStatsSort("honor_score")} title="冠军次数；没有冠军时为最佳名次（不含资格赛）">
            <div class="flex items-center justify-center gap-1">
              <span>冠军 / 最佳</span>
              {#if statsSortField === "honor_score"}
                <span class="text-primary">{statsSortOrder === "asc" ? "▲" : "▼"}</span>
              {/if}
            </div>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border/60">
        {#each sortedStatsPlayers as p}
          <tr
            onclick={() => (selected = p)}
            class="hover:bg-muted/20 transition-colors cursor-pointer {selected?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}"
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
            <td class="py-2 px-2 text-center whitespace-nowrap">
              {#if p.championships > 0}
                <span class="inline-flex items-center gap-0.5 font-bold text-amber-500" title={tierBreakdown(p.championships_by_tier).map((t) => `${t.name} ×${t.count}`).join(" · ") || `${p.championships} 次冠军`}>
                  <TrophyIcon class="w-3 h-3" />×{p.championships}
                </span>
              {:else if p.best_place}
                <span class="text-[10px] text-muted-foreground" title="最佳名次">{placeText(p.best_place)}</span>
              {:else}
                <span class="text-muted-foreground/50">—</span>
              {/if}
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
        onclick={() => (selected = p)}
        class="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer
          {selected?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/20'}"
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
            {#if p.championships > 0}
              · 🏆 ×{p.championships}
            {:else if p.best_place}
              · 最佳 {placeText(p.best_place)}
            {/if}
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
