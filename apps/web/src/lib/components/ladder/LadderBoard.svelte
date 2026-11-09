<script>
  // The leaderboard: scoring window, inactive players, minimum games and
  // search; table on wide screens, cards on phones. Clicking a player
  // opens `detail` (snippet, given the player) under their row; clicking
  // again closes it (onselect(null)).
  import { Chip } from "#lib/components/ui/chip/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import { formatWinRate, daysAgo } from "#lib/ladder.js";
  import TierBadge from "#lib/components/TierBadge.svelte";
  import Flag from "#lib/components/Flag.svelte";
  import { userState } from "#lib/user.svelte.js";
  import { PAGE_SIZE, scrollToRow, visibleRows } from "#lib/expand-row.js";
  import ShowMoreRows from "#lib/components/ShowMoreRows.svelte";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  let {
    players = [],
    scoreWindow = "all", // "all" | "year"
    includeInactive = false,
    selected = null,
    onwindow,
    oninactive,
    onselect,
    detail,
  } = $props();

  // The first rows only, until asked for more (search shows everything).
  let limit = $state(PAGE_SIZE);
  let shownPlayers = $derived(visibleRows(filteredPlayers, limit, { selectedId: selected?.id, searching: query.trim() !== "" }));

  const toggle = (p) => onselect(selected?.id === p.id ? null : p);
  let me = $derived(userState.id ? players.find((p) => p.id === userState.id) : null);
  function showMe() {
    query = "";
    minGames = 0;
    onselect(me);
    scrollToRow(me.id);
  }

  let query = $state("");
  // Minimum games, as on the statistics page (0 = all). Ranks stay those of
  // the full board.
  let minGames = $state(0);
  let filteredPlayers = $derived.by(() => {
    const shown = (players || []).filter((p) => !minGames || (p.games || 0) >= minGames);
    const q = query.trim().toLowerCase();
    if (!q) return shown;
    return shown.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.display_name || "").toLowerCase().includes(q) ||
        (p.team || "").toLowerCase().includes(q),
    );
  });
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <Card.Title class="text-base font-bold flex items-center gap-2">
        <TrophyIcon class="w-4 h-4 text-amber-500" />
        排行榜
      </Card.Title>
      <Card.Description class="text-small">
        段位按大师 4%、钻石/白金/黄金/白银各 23%、青铜 4%；大段内按名次分 I/II/III；宗师为区域前 200，小池子不设。
      </Card.Description>
    </div>
    <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
      {#if me}
        <button type="button" onclick={showMe} class="h-7 rounded-md border border-primary/40 bg-primary/10 px-2 text-small font-semibold text-brand-ink hover:bg-primary/20 cursor-pointer">我的天梯</button>
      {/if}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="计分范围">
        {#each [["all", "全部历史"], ["year", "最近一年"]] as [value, label] (value)}
          <Chip selected={scoreWindow === value} onclick={() => onwindow(value)}>{label}</Chip>
        {/each}
      </div>
      <label class="flex items-center gap-1.5 text-small text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeInactive}
          onchange={oninactive}
          class="accent-primary"
        />
        显示不活跃
      </label>
      <select
        bind:value={minGames}
        aria-label="场次"
        class="h-7 text-small rounded-md bg-muted/40 border border-border focus:border-primary/50 outline-none text-foreground px-2 pr-6 cursor-pointer"
      >
        <option value={0}>全部场次</option>
        <option value={2}>≥ 2 场</option>
        <option value={5}>≥ 5 场</option>
        <option value={10}>≥ 10 场</option>
      </select>
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
          <tr class="text-label uppercase tracking-wider text-muted-foreground bg-muted/20">
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
          {#each shownPlayers as p (p.id)}
            <tr
              data-row={p.id}
              onclick={() => toggle(p)}
              aria-expanded={selected?.id === p.id}
              class="hover:bg-muted/20 transition-colors cursor-pointer scroll-mt-20
                {selected?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}
                {userState.id === p.id ? 'bg-primary/5' : ''}"
            >
              <td class="py-2.5 px-3 text-center num font-bold">
                {#if p.rank === 1}
                  <span class="text-amber-700 dark:text-amber-400">1</span>
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
                  <Flag code={p.flag} size={18} />
                  {#if p.team}
                    <span class="text-small text-muted-foreground font-bold num shrink-0">[{p.team}]</span>
                  {/if}
                  <span class="truncate">{p.display_name}</span>
                  {#if p.provisional}
                    <span class="text-small text-muted-foreground/70 shrink-0">定级中</span>
                  {/if}
                  {#if p.active === false}
                    <span class="text-small text-amber-500/80 shrink-0">不活跃</span>
                  {/if}
                </div>
              </td>
              <td class="py-2.5 px-2 text-center">
                <TierBadge tier={p.tier} />
              </td>
              <td class="py-2.5 px-2 text-center num font-black text-sm">{p.mmr}</td>
              <td class="py-2.5 px-2 text-center num text-muted-foreground">{p.games}</td>
              <td class="py-2.5 px-2 text-center num text-muted-foreground">
                <span class="font-bold text-foreground">{p.wins}</span> - {p.losses}
              </td>
              <td class="py-2.5 px-2 text-center num font-bold
                {p.win_rate >= 0.6 ? 'text-emerald-500' : p.win_rate <= 0.4 ? 'text-rose-500/80' : 'text-foreground'}">
                {formatWinRate(p.win_rate)}
              </td>
              <td class="py-2.5 px-2 text-center num text-small text-muted-foreground">
                {daysAgo(p.last_game_at)}
              </td>
            </tr>
            {#if selected?.id === p.id && detail}
              <tr class="bg-muted/10">
                <td colspan="8" class="p-3 cursor-default">{@render detail(p)}</td>
              </tr>
            {/if}
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
      {#each shownPlayers as p (p.id)}
        <button
          type="button"
          data-row={p.id}
          onclick={() => toggle(p)}
          aria-expanded={selected?.id === p.id}
          class="w-full text-left px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer scroll-mt-20
            {selected?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/20'}"
        >
          <span class="w-6 shrink-0 text-center num font-bold
            {p.rank === 1 ? 'text-amber-700 dark:text-amber-400' : p.rank === 2 ? 'text-zinc-400' : p.rank === 3 ? 'text-amber-700' : 'text-muted-foreground'}">
            {p.rank}
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <Flag code={p.flag} size={18} />
              {#if p.team}
                <span class="text-small text-muted-foreground font-bold num shrink-0">[{p.team}]</span>
              {/if}
              <span class="truncate font-semibold text-sm">{p.display_name}</span>
              {#if p.provisional}
                <span class="text-small text-muted-foreground/70 shrink-0">定级中</span>
              {/if}
              {#if p.active === false}
                <span class="text-small text-amber-500/80 shrink-0">不活跃</span>
              {/if}
            </div>
            <div class="flex items-center gap-1.5 mt-1 min-w-0">
              <TierBadge tier={p.tier} className="shrink-0" />
              <span class="text-small num text-muted-foreground truncate">
                {p.games} 场 · {p.wins}-{p.losses} · {formatWinRate(p.win_rate)}
              </span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="num font-black text-sm">{p.mmr}</div>
            <div class="text-small text-muted-foreground">{daysAgo(p.last_game_at)}</div>
          </div>
          <ChevronDownIcon class="w-4 h-4 shrink-0 text-muted-foreground transition-transform {selected?.id === p.id ? 'rotate-180' : ''}" />
        </button>
        {#if selected?.id === p.id && detail}
          <div class="bg-muted/10 p-2">{@render detail(p)}</div>
        {/if}
      {/each}
      {#if filteredPlayers.length === 0}
        <div class="py-10 text-center text-xs text-muted-foreground italic">
          暂无天梯记录。完成一场赛事对局后就会自动计入。
        </div>
      {/if}
    </div>
    <ShowMoreRows shown={shownPlayers.length} total={filteredPlayers.length} onmore={() => (limit = shownPlayers.length + PAGE_SIZE)} onall={() => (limit = Infinity)} />
  </Card.Content>
</Card.Root>
