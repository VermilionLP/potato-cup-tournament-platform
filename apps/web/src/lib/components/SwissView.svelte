<script>
  import CrownIcon from "@lucide/svelte/icons/crown";
  import Flag from "$lib/components/Flag.svelte";
  import { canCorrectResult } from "$lib/tournament.js";
  import { groupSwissRounds } from "$lib/bracket.js";

  let {
    matches = [],
    players = [],
    standings = [],
    totalRounds = null,
    status = "",
    activeMatchId = null,
    isAdmin = false,
    userId = "",
    onOpenMatch = () => {},
    onToggleActive = () => {},
    onEditRounds = () => {},
  } = $props();

  const playerById = $derived(new Map((players || []).map((p) => [p.id, p])));
  const rounds = $derived(groupSwissRounds(matches));
  const currentRound = $derived(rounds.length ? rounds[rounds.length - 1].round : 0);
  const finished = $derived(
    rounds.length > 0 &&
      currentRound >= (totalRounds || 0) &&
      rounds[rounds.length - 1].matches.every((m) => m.status !== "pending"),
  );

  function nameOf(id) {
    if (!id) return "TBD";
    return playerById.get(id)?.display_name || id;
  }

  function isBye(match) {
    return Boolean(match.player1_id) !== Boolean(match.player2_id);
  }

  function isPlayable(match) {
    return (
      status === "in_progress" &&
      match.status === "pending" &&
      Boolean(match.player1_id && match.player2_id)
    );
  }

  function scoreLabel(match, slot) {
    if (match.status === "pending") return "";
    if (match.status === "walkover") {
      const id = slot === 1 ? match.player1_id : match.player2_id;
      return match.winner_id === id ? "W" : "FF";
    }
    return slot === 1 ? match.score1 : match.score2;
  }

  function signed(n) {
    return n > 0 ? `+${n}` : String(n);
  }
</script>

{#snippet playerRow(match, slot)}
  {@const id = slot === 1 ? match.player1_id : match.player2_id}
  {@const won = Boolean(id) && match.winner_id === id}
  <div class="flex h-[28px] items-center justify-between {slot === 1 ? 'border-b border-neutral-200/60 dark:border-neutral-900/50' : ''}">
    <div class="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
      <Flag code={playerById.get(id)?.flag} size={14} />
      <span
        class="truncate text-[10.5px]
          {won ? 'font-black text-foreground' : 'font-semibold text-neutral-700 dark:text-neutral-300'}"
      >
        {nameOf(id)}
      </span>
      {#if won}
        <CrownIcon class="h-2.5 w-2.5 shrink-0 text-amber-500" />
      {/if}
    </div>
    {#if match.status !== "pending"}
      <div
        class="flex h-full w-7 shrink-0 items-center justify-center border-l border-neutral-200 font-mono text-[11px] font-bold dark:border-neutral-900/60
          {won ? 'text-primary' : 'text-neutral-400 dark:text-neutral-500'}"
      >
        {scoreLabel(match, slot)}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet matchCard(match)}
  {#if isBye(match)}
    <div
      class="flex h-[76px] items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-100/70 px-2 text-center text-[10px] text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900/40"
    >
      轮空 · {nameOf(match.player1_id || match.player2_id)} 记一胜
    </div>
  {:else}
    {@const playable = isPlayable(match)}
    {@const editable = isAdmin && canCorrectResult(match)}
    {@const clickable = playable || editable}
    {@const active = activeMatchId === match.id}
    <div
      role="button"
      tabindex="0"
      onclick={() => {
        if (clickable) onOpenMatch(match);
      }}
      onkeydown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && clickable) onOpenMatch(match);
      }}
      class="flex h-[76px] flex-col justify-between overflow-hidden rounded-md border bg-white text-xs shadow-sm transition-all dark:bg-[#1c1c1c]
        {clickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
        {playable ? 'border-primary/30 ring-2 ring-primary/40' : 'border-neutral-300 dark:border-neutral-800'}
        {active ? 'border-amber-500/40 ring-2 ring-amber-500/70' : ''}"
    >
      <div
        class="flex h-[18px] shrink-0 items-center justify-between border-b border-neutral-200 bg-neutral-100 px-2 text-[8px] font-mono text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
      >
        <span>第 {match.round} 轮 · 场次 {match.position}</span>
        <div class="flex items-center gap-1">
          {#if isAdmin && playable}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                onToggleActive(match);
              }}
              class="rounded px-1 py-0.5 text-[7px] font-bold transition-all
                {active ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-primary text-primary-foreground hover:bg-primary/85'}"
            >
              {active ? "直播中" : "推流直播"}
            </button>
          {/if}
          {#if userId && match.status === "pending" && (match.player1_id === userId || match.player2_id === userId)}
            <span class="animate-pulse font-bold text-primary">我的比赛</span>
          {/if}
          {#if editable}
            <span class="rounded bg-amber-500/15 px-1 py-0.5 text-[7px] font-bold text-amber-500">修正</span>
          {/if}
        </div>
      </div>
      {@render playerRow(match, 1)}
      {@render playerRow(match, 2)}
    </div>
  {/if}
{/snippet}

<div class="space-y-6 py-1">
  <div class="flex flex-wrap items-center gap-2 text-[11px]">
    <span class="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-bold text-primary">
      共 {totalRounds ?? "?"} 轮
    </span>
    {#if currentRound > 0}
      <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
        {finished ? "全部轮次已完成" : `当前第 ${currentRound} 轮`}
      </span>
    {/if}
    {#if isAdmin && status !== "completed"}
      <button
        type="button"
        onclick={onEditRounds}
        class="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        修改轮数
      </button>
    {/if}
    <span class="text-muted-foreground/80">
      胜 1 分 · 同分依次比小分净胜、布赫霍尔茨分（对手积分之和）
    </span>
  </div>

  {#if standings.length}
    <section>
      <div class="mb-2 text-xs font-bold text-foreground">积分榜</div>
      <div class="overflow-x-auto rounded-xl border border-border/50 bg-background/25">
        <table class="w-full border-collapse text-left text-xs text-foreground/95">
          <thead>
            <tr class="border-b border-border/50 bg-muted/20 text-[10px] font-bold uppercase text-muted-foreground">
              <th class="w-12 px-3 py-2 text-center">名次</th>
              <th class="px-3 py-2">选手</th>
              <th class="w-16 px-3 py-2 text-center">胜-负</th>
              <th class="w-14 px-3 py-2 text-center">积分</th>
              <th class="w-16 px-3 py-2 text-center" title="所有比赛小分之差">小分净胜</th>
              <th class="w-16 px-3 py-2 text-center" title="所有对手的积分之和">布赫霍尔茨</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/30">
            {#each standings as row (row.player_id)}
              <tr class="{row.player_id === userId ? 'bg-primary/5' : ''} hover:bg-background/40">
                <td class="px-3 py-2 text-center font-bold {row.rank === 1 && finished ? 'text-amber-500' : 'text-primary'}">
                  {row.rank}
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1.5">
                    <Flag code={playerById.get(row.player_id)?.flag} size={14} />
                    <span class="truncate font-semibold">{nameOf(row.player_id)}</span>
                    {#if row.rank === 1 && finished}
                      <CrownIcon class="h-3 w-3 text-amber-500" />
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
