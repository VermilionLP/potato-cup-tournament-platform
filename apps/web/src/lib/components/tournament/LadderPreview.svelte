<script>
  // "天梯分预估" under the score form: each player's ladder MMR in the
  // event's division now, and after a win or a loss (#lib/ladder-sim.js).
  // The column of the score being entered is highlighted.
  import { simulateMatch } from "#lib/ladder-sim.js";
  import { gameModeLabel, vehiclePoolLabel } from "#lib/tournament.js";

  let { match, tournament, playerName = (id) => id, score1 = 0, score2 = 0 } = $props();

  const find = (id) => tournament?.players?.find((p) => p.id === id);
  let sim = $derived(simulateMatch(find(match.player1_id), find(match.player2_id)));
  // "a" when player 1 is ahead in the entered score, "b" for player 2, else none.
  let picked = $derived(Number(score1) > Number(score2) ? "a" : Number(score2) > Number(score1) ? "b" : "");
  let division = $derived([gameModeLabel(tournament?.game_mode), vehiclePoolLabel(tournament?.vehicle_pool)].filter(Boolean).join(" · "));

  const signed = (n) => (n > 0 ? `+${n}` : String(n));
  const tone = (n) => (n > 0 ? "text-emerald-500" : n < 0 ? "text-rose-500" : "text-muted-foreground");
</script>

<div class="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-xs space-y-2">
  <div class="font-bold">天梯分预估<span class="ml-1.5 font-normal text-muted-foreground">{division} 分榜</span></div>
  <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 gap-y-1">
    <span></span>
    <span class="text-[10px] text-muted-foreground text-right">当前</span>
    <span class="text-[10px] text-right rounded px-1 {picked === 'a' ? 'bg-primary/15 font-bold text-primary' : 'text-muted-foreground'}">{playerName(match.player1_id, match)} 胜</span>
    <span class="text-[10px] text-right rounded px-1 {picked === 'b' ? 'bg-primary/15 font-bold text-primary' : 'text-muted-foreground'}">{playerName(match.player2_id, match)} 胜</span>
    {#each [["a", match.player1_id], ["b", match.player2_id]] as [key, id] (key)}
      {@const now = sim[key]}
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="truncate font-semibold">{playerName(id, match)}</span>
        {#if now.provisional}<span class="shrink-0 rounded border border-amber-500/40 px-1 text-[9px] text-amber-500" title="前 10 场分数变化更大">定级中</span>{/if}
      </span>
      <span class="font-mono text-right">{now.mmr}</span>
      {#each ["ifAWins", "ifBWins"] as which, col (which)}
        {@const r = sim[which][key]}
        <span class="font-mono text-right rounded px-1 {picked === (col === 0 ? 'a' : 'b') ? 'bg-primary/10' : ''}">
          {r.after} <span class={tone(r.delta)}>{signed(r.delta)}</span>
        </span>
      {/each}
    {/each}
  </div>
  <p class="text-[10px] text-muted-foreground">按胜负计算，与小比分无关；同时提交的其他比赛可能让结果略有不同。</p>
</div>
