<script>
  import BracketMatchCard from "#lib/components/BracketMatchCard.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import Flag from "#lib/components/Flag.svelte";
  import { groupSwissRounds } from "#lib/bracket.js";

  let {
    matches = [],
    players = [],
    standings = [],
    totalRounds = null,
    status = "",
    activeMatchId = null,
    liveElsewhere = new Map(), // match id -> another live channel
    isAdmin = false,
    userId = "",
    onOpenMatch = () => {},
    onToggleActive = () => {},
    banpickEnabled = false,
    onBanPick = () => {},
    onEditRounds = () => {},
    // Two-stage events: [{ group, label, rows }] standings per group, how many
    // advance from each group, and whether results are frozen (playoff started).
    groups = [],
    perGroup = 0,
    locked = false,
  } = $props();

  let selectedGroup = $state(1);
  const hasGroups = $derived(groups.length > 1);
  const activeGroup = $derived(
    groups.length ? groups.find((g) => g.group === selectedGroup) || groups[0] : null,
  );
  const shownStandings = $derived(activeGroup ? activeGroup.rows : standings);
  // Automatic round counts can differ per group (e.g. groups of 4 and 3).
  const roundsTotal = $derived(activeGroup?.rounds ?? totalRounds);
  const shownMatches = $derived(
    activeGroup && hasGroups
      ? matches.filter((m) => (m.swiss_group || 1) === activeGroup.group)
      : matches,
  );

  const playerById = $derived(new Map((players || []).map((p) => [p.id, p])));
  const rounds = $derived(groupSwissRounds(shownMatches));
  const currentRound = $derived(rounds.length ? rounds[rounds.length - 1].round : 0);
  const finished = $derived(
    rounds.length > 0 &&
      currentRound >= (roundsTotal || 0) &&
      rounds[rounds.length - 1].matches.every((m) => m.status !== "pending"),
  );

  function nameOf(id) {
    if (!id) return "TBD";
    return playerById.get(id)?.display_name || id;
  }

  function isBye(match) {
    return Boolean(match.player1_id) !== Boolean(match.player2_id);
  }


  function signed(n) {
    return n > 0 ? `+${n}` : String(n);
  }
</script>

{#snippet matchCard(match)}
  {#if isBye(match)}
    <div
      class="flex h-[76px] items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-100/70 px-2 text-center text-[10px] text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900/40"
    >
      轮空 · {nameOf(match.player1_id || match.player2_id)} 记一胜
    </div>
  {:else}
    <BracketMatchCard
      {match}
      title="第 {match.round} 轮 · 场次 {match.position}"
      {status}
      {locked}
      nameOf={(m, slot) => nameOf(slot === 1 ? m.player1_id : m.player2_id)}
      flagOf={(id) => playerById.get(id)?.flag}
      {activeMatchId}
      otherChannel={liveElsewhere.get(match.id)}
      {isAdmin}
      {userId}
      {banpickEnabled}
      onopen={onOpenMatch}
      ontoggleactive={onToggleActive}
      onbanpick={onBanPick}
      class="h-[76px]"
    />
  {/if}
{/snippet}

<div class="space-y-6 py-1">
  <div class="flex flex-wrap items-center gap-2 text-[11px]">
    <span class="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-bold text-primary">
      共 {roundsTotal ?? "?"} 轮
    </span>
    {#if currentRound > 0}
      <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
        {finished ? "全部轮次已完成" : `当前第 ${currentRound} 轮`}
      </span>
    {/if}
    {#if locked}
      <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground" title="淘汰赛已开始，小组赛结果已锁定">已锁定</span>
    {:else if isAdmin && status !== "completed"}
      <button
        type="button"
        onclick={onEditRounds}
        class="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        修改轮数
      </button>
    {/if}
    <span class="text-muted-foreground/80">
      胜 1 分 · 同分依次比小分净胜、对手分（所有对手的积分之和）
    </span>
  </div>

  {#if hasGroups}
    <div class="flex flex-wrap gap-1.5">
      {#each groups as g (g.group)}
        <button
          type="button"
          onclick={() => (selectedGroup = g.group)}
          class="rounded-full border px-3 py-0.5 text-xs font-semibold transition-colors cursor-pointer
            {activeGroup?.group === g.group ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground/80 hover:border-foreground/40'}"
        >
          {g.label} 组 · {g.rows.length} 人
        </button>
      {/each}
    </div>
  {/if}

  {#if shownStandings.length}
    <section>
      <div class="mb-2 flex items-center gap-2 text-xs font-bold text-foreground">
        {activeGroup && hasGroups ? `${activeGroup.label} 组积分榜` : "积分榜"}
        {#if perGroup}
          <span class="text-[10px] font-normal text-muted-foreground">前 {perGroup} 名晋级淘汰赛</span>
        {/if}
      </div>
      <div class="overflow-x-auto rounded-xl border border-border/50 bg-background/25">
        <table class="w-full border-collapse text-left text-xs text-foreground/95">
          <thead>
            <tr class="border-b border-border/50 bg-muted/20 text-[10px] font-bold uppercase text-muted-foreground">
              <th class="w-12 px-3 py-2 text-center">名次</th>
              <th class="px-3 py-2">选手</th>
              <th class="w-16 px-3 py-2 text-center">胜-负</th>
              <th class="w-14 px-3 py-2 text-center">积分</th>
              <th class="w-16 px-3 py-2 text-center" title="所有比赛小分之差">小分净胜</th>
              <th class="w-16 px-3 py-2 text-center" title="对手分：所有对手的积分之和（布赫霍尔茨分），对手越强越高">对手分</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/30">
            {#each shownStandings as row (row.player_id)}
              <tr
                class="{row.player_id === userId ? 'bg-primary/5' : ''} hover:bg-background/40
                  {perGroup && row.rank === perGroup ? 'border-b-2 border-dashed border-b-emerald-500/50' : ''}"
              >
                <td class="px-3 py-2 text-center font-bold {row.rank === 1 && finished ? 'text-amber-500' : 'text-primary'}">
                  {row.rank}
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1.5">
                    <Flag code={playerById.get(row.player_id)?.flag} size={14} />
                    <span class="truncate font-semibold">{nameOf(row.player_id)}</span>
                    {#if row.rank === 1 && finished && !perGroup}
                      <CrownIcon class="h-3 w-3 text-amber-500" />
                    {/if}
                    {#if perGroup && row.rank <= perGroup}
                      <span class="rounded bg-emerald-500/15 px-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">晋级</span>
                    {/if}
                    {#if row.byes > 0}
                      <span class="text-[9px] text-muted-foreground" title="轮空计一胜">轮空</span>
                    {/if}
                  </div>
                </td>
                <td class="px-3 py-2 text-center font-mono">{row.wins}-{row.losses}</td>
                <td class="px-3 py-2 text-center font-mono font-bold">{row.points}</td>
                <td class="px-3 py-2 text-center font-mono">{signed(row.game_diff)}</td>
                <td class="px-3 py-2 text-center font-mono">{row.buchholz}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  {#each [...rounds].reverse() as r (r.round)}
    <section>
      <div class="mb-2 flex items-center gap-2">
        <span class="text-xs font-bold text-foreground">第 {r.round} 轮</span>
        <span class="text-[10px] text-muted-foreground">
          {r.matches.filter((m) => m.status !== "pending").length} / {r.matches.length} 场已完成
        </span>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each r.matches as match (match.id)}
          {@render matchCard(match)}
        {/each}
      </div>
    </section>
  {/each}

  {#if !rounds.length}
    <p class="py-6 text-center text-xs text-muted-foreground">报名选手达到 2 人后会生成第 1 轮对阵。</p>
  {/if}
</div>
