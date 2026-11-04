<script>
  // Phone view of an elimination bracket: round tabs (opening on the round
  // being played) and that round's matches as a list of the same cards as
  // the bracket (BracketMatchCard; tabs from #lib/round-list.js).
  import { roundTabs, currentTabKey } from "#lib/round-list.js";
  import BracketMatchCard from "#lib/components/BracketMatchCard.svelte";

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
        <BracketMatchCard
          match={m}
          title="#{order.get(m.id) ?? "?"}{m.round === 0 ? " · 三四名决赛" : ""}"
          {status}
          nameOf={(mm, slot) => playerName(slot === 1 ? mm.player1_id : mm.player2_id, mm)}
          {flagOf}
          {activeMatchId}
          otherChannel={liveElsewhere.get(m.id)}
          {isAdmin}
          {userId}
          {banpickEnabled}
          {onopen}
          {ontoggleactive}
          {onbanpick}
        />
      {/each}
    </div>
  </div>
{/if}
