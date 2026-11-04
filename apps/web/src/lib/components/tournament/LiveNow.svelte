<script>
  // "正在进行": the matches live on a stream and the ones ready to play,
  // for the event page's overview and live tabs (#lib/match-day.js).
  import { matchDayBoard } from "#lib/match-day.js";
  import Flag from "#lib/components/Flag.svelte";
  import RadioIcon from "@lucide/svelte/icons/radio";

  let { tournament, order = new Map(), roundLabel = () => "", playerName = (id) => id, onopen = () => {}, limit = 8 } = $props();

  let board = $derived(matchDayBoard(tournament, order));
  let ready = $derived(board.ready.slice(0, limit));
  let flagOf = (id) => tournament?.players?.find((p) => p.id === id)?.flag;
</script>

{#snippet row(m, channel)}
  <button type="button" onclick={() => onopen(m)} class="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left text-xs hover:border-primary/40 cursor-pointer">
    <span class="min-w-0 space-y-0.5">
      <span class="block text-[10px] text-muted-foreground">#{order.get(m.id) ?? "?"} · {roundLabel(m)}</span>
      <span class="flex flex-wrap items-center gap-1.5 font-semibold">
        <Flag code={flagOf(m.player1_id)} size={13} />{playerName(m.player1_id, m)}
        <span class="text-[10px] font-normal text-muted-foreground">vs</span>
        <Flag code={flagOf(m.player2_id)} size={13} />{playerName(m.player2_id, m)}
      </span>
    </span>
    {#if channel}
      <span class="shrink-0 inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-500"><RadioIcon class="w-3 h-3" />频道 {channel}</span>
    {/if}
  </button>
{/snippet}

<section class="rounded-xl border border-border bg-card/40 p-4 space-y-3">
  <div class="flex items-center justify-between">
    <h2 class="text-sm font-bold">正在进行</h2>
    {#if board.total}<span class="text-[11px] text-muted-foreground">已完成 {board.done} / {board.total} 场</span>{/if}
  </div>
  {#if board.live.length}
    <div class="space-y-1.5">
      <div class="text-[11px] text-muted-foreground">直播中</div>
      {#each board.live as x (x.channel)}{@render row(x.match, x.channel)}{/each}
    </div>
  {/if}
  <div class="space-y-1.5">
    <div class="text-[11px] text-muted-foreground">可以开打{board.ready.length > ready.length ? `（共 ${board.ready.length} 场，显示前 ${ready.length} 场）` : ""}</div>
    {#each ready as m (m.id)}{@render row(m, null)}{:else}<p class="text-xs italic text-muted-foreground">暂时没有可以开打的比赛</p>{/each}
  </div>
</section>
