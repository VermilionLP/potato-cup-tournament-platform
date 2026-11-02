<script>
  // Phone view of an elimination bracket: round tabs (opening on the round
  // being played) and that round's matches as a list, with the same card
  // buttons as the bracket ($lib/round-list.js).
  import { roundTabs, currentTabKey } from "$lib/round-list.js";
  import { isMine, isPlayableIn, slotScore } from "$lib/match-card.js";
  import { canCorrectResult } from "$lib/tournament.js";
  import Flag from "$lib/components/Flag.svelte";
  import MatchCardActions from "./MatchCardActions.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";

  let {
    matches = [],
    players = [],
    status = "",
    roundLabel = () => "",
    order = new Map(),
    playerName = (id) => id,
    activeMatchId = null,
    liveElsewhere = new Map(),
    isAdmin = false,
    userId = "",
    banpickEnabled = false,
    onopen = () => {},
    onbanpick = () => {},
    ontoggleactive = () => {},
  } = $props();

  let tabs = $derived(roundTabs(matches, roundLabel, order));
  let chosen = $state("");
  let shownKey = $derived(tabs.some((t) => t.key === chosen) ? chosen : currentTabKey(tabs));
  let shown = $derived(tabs.find((t) => t.key === shownKey));
  let flagOf = (id) => players.find((p) => p.id === id)?.flag;
</script>

{#if tabs.length}
  <div class="space-y-3">
    <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="轮次">
      {#each tabs as t (t.key)}
        <button
          type="button"
          role="tab"
          aria-selected={t.key === shownKey}
          onclick={() => (chosen = t.key)}
          class="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer
            {t.key === shownKey ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground/80'}"
        >
          {t.label}
          <span class="ml-1 text-[10px] font-normal opacity-75">{t.done}/{t.total}</span>
        </button>
      {/each}
    </div>

    <div class="space-y-2">
      {#each shown?.matches || [] as m (m.id)}
        {@const playable = isPlayableIn(m, status)}
        {@const correctable = isAdmin && canCorrectResult(m)}
        {@const clickable = playable || correctable}
        <div
          role="button"
          tabindex="0"
          onclick={() => clickable && onopen(m)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && clickable && onopen(m)}
          class="rounded-lg border bg-card text-xs overflow-hidden
            {clickable ? 'cursor-pointer' : 'cursor-default'}
            {playable ? 'border-primary/40 ring-1 ring-primary/30' : 'border-border'}
            {activeMatchId === m.id ? 'ring-2 ring-amber-500/70' : ''}"
        >
          <div class="flex items-center justify-between border-b border-border/60 bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
            <span>#{order.get(m.id) ?? "?"}{m.round === 0 ? " · 三四名决赛" : ""}</span>
            <MatchCardActions
              match={m}
              {playable}
              active={activeMatchId === m.id}
              otherChannel={liveElsewhere.get(m.id)}
              {isAdmin}
              {banpickEnabled}
              mine={isMine(m, userId)}
              {correctable}
              {ontoggleactive}
              {onbanpick}
            />
          </div>
          {#each [1, 2] as slot (slot)}
            {@const id = slot === 1 ? m.player1_id : m.player2_id}
            {@const won = Boolean(m.winner_id) && m.winner_id === id}
            <div class="flex items-center justify-between px-2.5 py-1.5 {slot === 1 ? 'border-b border-border/40' : ''}">
              <span class="flex min-w-0 items-center gap-1.5 {won ? 'font-black' : id ? 'font-medium' : 'italic text-muted-foreground'}">
                {#if id}<Flag code={flagOf(id)} size={14} />{/if}
                <span class="truncate">{playerName(id, m)}</span>
                {#if won}<CrownIcon class="h-3 w-3 shrink-0 text-amber-500" />{/if}
              </span>
              {#if m.status !== "pending"}
                <span class="font-mono font-bold {won ? 'text-primary' : 'text-muted-foreground'}">{slotScore(m, slot)}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
