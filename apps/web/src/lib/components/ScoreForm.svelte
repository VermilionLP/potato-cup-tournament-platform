<script>
  import CrownIcon from "@lucide/svelte/icons/crown";
  import Flag from "$lib/components/Flag.svelte";
  import { SCORE_PRESETS, scoreOutcome } from "$lib/tournament.js";

  let {
    player1 = { id: "", name: "", flag: "", seed: null },
    player2 = { id: "", name: "", flag: "", seed: null },
    score1 = $bindable(0),
    score2 = $bindable(0),
    format = "single_elim",
    loserAdvances = false,
    disabled = false,
    onWalkover = () => {},
  } = $props();

  const MAX_SCORE = 99;
  const outcome = $derived(scoreOutcome(score1, score2, { format, loserAdvances }));
  const advancerName = $derived(
    outcome.advancer === 1 ? player1.name : outcome.advancer === 2 ? player2.name : "",
  );
  const winnerName = $derived(
    outcome.winner === 1 ? player1.name : outcome.winner === 2 ? player2.name : "",
  );

  function clamp(n) {
    const v = Math.round(Number(n) || 0);
    return Math.min(MAX_SCORE, Math.max(0, v));
  }

  function step(slot, delta) {
    if (slot === 1) score1 = clamp(score1 + delta);
    else score2 = clamp(score2 + delta);
  }

  function preset([a, b]) {
    score1 = a;
    score2 = b;
  }
</script>

{#snippet side(slot, player)}
  {@const leading = outcome.winner === slot}
  <div
    class="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-all
      {leading ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40' : 'border-border bg-background/40'}"
  >
    <div class="flex h-5 items-center gap-1">
      {#if leading}
        <CrownIcon class="h-3.5 w-3.5 text-amber-500" />
        <span class="text-[10px] font-bold text-primary">胜者</span>
      {:else if player.seed}
        <span class="text-[10px] text-muted-foreground">种子 #{player.seed}</span>
      {/if}
    </div>
    <div class="flex max-w-full items-center gap-1.5">
      <Flag code={player.flag} size={16} />
      <span class="truncate text-sm font-bold text-foreground" title={player.name}>{player.name}</span>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        {disabled}
        onclick={() => step(slot, -1)}
        class="flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 cursor-pointer"
        aria-label="{player.name} 减 1 分">−</button
      >
      {#if slot === 1}
        <input
          type="number"
          min="0"
          max={MAX_SCORE}
          {disabled}
          bind:value={score1}
          onblur={() => (score1 = clamp(score1))}
          aria-label="{player.name} 的比分"
          class="score-input h-14 w-16 rounded-lg border border-border bg-background text-center font-mono text-4xl font-black
            {leading ? 'text-primary' : 'text-foreground'}"
        />
      {:else}
        <input
          type="number"
          min="0"
          max={MAX_SCORE}
          {disabled}
          bind:value={score2}
          onblur={() => (score2 = clamp(score2))}
          aria-label="{player.name} 的比分"
          class="score-input h-14 w-16 rounded-lg border border-border bg-background text-center font-mono text-4xl font-black
            {leading ? 'text-primary' : 'text-foreground'}"
        />
      {/if}
      <button
        type="button"
        {disabled}
        onclick={() => step(slot, 1)}
        class="flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 cursor-pointer"
        aria-label="{player.name} 加 1 分">+</button
      >
    </div>
  </div>
{/snippet}

<div class="space-y-3">
  <div class="flex items-stretch gap-2">
    {@render side(1, player1)}
    <div class="flex shrink-0 items-center text-xs font-black text-muted-foreground">VS</div>
    {@render side(2, player2)}
  </div>

  <div class="flex flex-wrap items-center justify-center gap-1.5">
    <span class="text-[10px] text-muted-foreground">快捷比分</span>
    {#each SCORE_PRESETS as p (p.join(":"))}
      {@const active = Number(score1) === p[0] && Number(score2) === p[1]}
      <button
        type="button"
        {disabled}
        onclick={() => preset(p)}
        class="rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors cursor-pointer
          {active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground/80 hover:border-foreground/40'}"
      >
        {p[0]} : {p[1]}
      </button>
    {/each}
  </div>

  <div
    class="rounded-lg px-3 py-2 text-center text-xs
      {outcome.tie ? 'bg-muted/60 text-muted-foreground' : 'bg-primary/10 text-foreground'}"
  >
    {#if outcome.tie}
      比分相同，无法判定胜者，请调整比分
    {:else if outcome.advancer !== outcome.winner}
      <span class="font-bold">{winnerName}</span> 获胜 ·
      <span class="font-bold text-primary">{advancerName}</span> 晋级（败者晋级规则）
    {:else}
      <span class="font-bold text-primary">{winnerName}</span> 获胜
    {/if}
  </div>

  <details class="group rounded-lg border border-border/60 px-3 py-1.5 text-xs">
    <summary class="cursor-pointer select-none text-muted-foreground hover:text-foreground">
      弃权判定（一方未到场或退赛）
    </summary>
    <div class="grid grid-cols-2 gap-2 pt-2 pb-1">
      <button
        type="button"
        {disabled}
        onclick={() => onWalkover(player1.id)}
        class="truncate rounded-md border border-border px-2 py-1.5 hover:bg-muted disabled:opacity-40 cursor-pointer"
      >
        判 {player1.name} 晋级
      </button>
      <button
        type="button"
        {disabled}
        onclick={() => onWalkover(player2.id)}
        class="truncate rounded-md border border-border px-2 py-1.5 hover:bg-muted disabled:opacity-40 cursor-pointer"
      >
        判 {player2.name} 晋级
      </button>
    </div>
  </details>
</div>

<style>
  /* Big score boxes: hide the browser's tiny spinner arrows. */
  .score-input::-webkit-outer-spin-button,
  .score-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .score-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }
</style>
