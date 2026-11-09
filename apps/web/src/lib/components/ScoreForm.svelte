<script>
  // The score of one match as a scoreboard: both players side by side with
  // a big score each (type it, or −/+), quick scores, and what the score
  // means (winner, or who advances under 败者晋级). Walkovers (弃权判定)
  // are separate (MatchResultDialog).
  import CrownIcon from "@lucide/svelte/icons/crown";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Flag from "#lib/components/Flag.svelte";
  import { SCORE_PRESETS, scoreOutcome } from "#lib/tournament.js";

  let {
    player1 = { id: "", name: "", flag: "", seed: null },
    player2 = { id: "", name: "", flag: "", seed: null },
    score1 = $bindable(0),
    score2 = $bindable(0),
    format = "single_elim",
    loserAdvances = false,
    disabled = false,
    // The match is being played: a tie is a normal live score, not a problem.
    liveHint = false,
  } = $props();

  const MAX_SCORE = 99;
  const outcome = $derived(scoreOutcome(score1, score2, { format, loserAdvances }));
  const nameOf = (slot) => (slot === 1 ? player1.name : player2.name);

  const clamp = (n) => Math.min(MAX_SCORE, Math.max(0, Math.round(Number(n) || 0)));
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
  {@const value = slot === 1 ? score1 : score2}
  <div class="flex min-w-0 flex-col items-center gap-2 {slot === 2 ? 'sm:items-center' : ''}">
    <div class="flex h-4 items-center gap-1 text-small">
      {#if leading}
        <CrownIcon class="h-3.5 w-3.5 text-amber-500" />
        <span class="font-bold text-brand-ink">领先</span>
      {:else if player.seed}
        <span class="text-muted-foreground">种子 #{player.seed}</span>
      {/if}
    </div>
    <div class="flex max-w-full items-center gap-1.5">
      <Flag code={player.flag} size={18} />
      <span class="truncate text-sm font-bold text-foreground sm:text-base" title={player.name}>{player.name}</span>
    </div>
    <input
      type="number"
      inputmode="numeric"
      min="0"
      max={MAX_SCORE}
      {disabled}
      value={value}
      oninput={(e) => (slot === 1 ? (score1 = e.currentTarget.value) : (score2 = e.currentTarget.value))}
      onblur={() => (slot === 1 ? (score1 = clamp(score1)) : (score2 = clamp(score2)))}
      onfocus={(e) => e.currentTarget.select()}
      aria-label="{player.name} 的比分"
      class="score-input h-20 w-24 rounded-2xl border-2 bg-background text-center num text-5xl font-black tabular-nums transition-colors focus:outline-none
        {leading ? 'border-primary text-brand-ink' : 'border-border text-foreground focus:border-primary/60'}"
    />
    <div class="flex items-center gap-2">
      <button
        type="button"
        {disabled}
        onclick={() => step(slot, -1)}
        class="flex h-9 w-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 cursor-pointer"
        aria-label="{player.name} 减 1 分"
      >
        <MinusIcon class="h-4 w-4" />
      </button>
      <button
        type="button"
        {disabled}
        onclick={() => step(slot, 1)}
        class="flex h-9 w-11 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-brand-ink transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40 cursor-pointer"
        aria-label="{player.name} 加 1 分"
      >
        <PlusIcon class="h-4 w-4" />
      </button>
    </div>
  </div>
{/snippet}

<div class="space-y-3">
  <!-- Scoreboard -->
  <div class="rounded-2xl border border-border bg-muted/20 px-3 py-4">
    <div class="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
      {@render side(1, player1)}
      <div class="flex h-full flex-col items-center justify-center pt-12">
        <span class="num text-3xl font-black text-muted-foreground/60">:</span>
      </div>
      {@render side(2, player2)}
    </div>
  </div>

  <!-- Quick scores -->
  <div class="flex flex-wrap items-center justify-center gap-1.5">
    {#each SCORE_PRESETS as p (p.join(":"))}
      {@const active = Number(score1) === p[0] && Number(score2) === p[1]}
      <button
        type="button"
        {disabled}
        onclick={() => preset(p)}
        class="rounded-lg border px-3 py-1 num text-xs font-semibold transition-colors cursor-pointer
          {active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground/80 hover:border-primary/50'}"
      >
        {p[0]} : {p[1]}
      </button>
    {/each}
  </div>

  <!-- What the score means -->
  <div
    class="rounded-lg px-3 py-2 text-center text-xs
      {outcome.tie ? 'bg-muted/60 text-muted-foreground' : 'bg-primary/10 text-foreground'}"
  >
    {#if outcome.tie}
      {liveHint ? "比分持平：可以保存为实时比分；提交最终比分需要分出胜负" : "比分相同，无法判定胜者，请调整比分"}
    {:else if outcome.advancer !== outcome.winner}
      <span class="font-bold">{nameOf(outcome.winner)}</span> 获胜 ·
      <span class="font-bold text-brand-ink">{nameOf(outcome.advancer)}</span> 晋级（败者晋级规则）
    {:else}
      <span class="font-bold text-brand-ink">{nameOf(outcome.winner)}</span> 获胜
    {/if}
  </div>
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
