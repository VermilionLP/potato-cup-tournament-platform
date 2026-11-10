<script>
  // Phone view of an elimination bracket: round tabs (opening on the round
  // being played) and that round's matches as a list of the same cards as
  // the bracket (BracketMatchCard; tabs from #lib/round-list.js).
  import { untrack } from "svelte";
  import { roundTabs, currentTabKey } from "#lib/round-list.js";
  import BracketMatchCard from "#lib/components/BracketMatchCard.svelte";
  import RoundBestOf from "./RoundBestOf.svelte";
  import { roundFormat } from "#lib/round-format.js";

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
    focus = null, // { match, at }: open that match's round ("find me")
    onopen = () => {},
    onbanpick = () => {},
    ontoggleactive = () => {},
  } = $props();

  let tabs = $derived(roundTabs(matches, roundLabel, order));
  let chosen = $state("");
  $effect(() => {
    const id = focus?.match?.id;
    if (!id) return;
    // Only when asked (focus changes), not on every live update of the tabs.
    const tab = untrack(() => tabs.find((t) => t.matches.some((m) => m.id === id)));
    if (tab) chosen = tab.key;
  });
  let shownKey = $derived(tabs.some((t) => t.key === chosen) ? chosen : currentTabKey(tabs));
  let shown = $derived(tabs.find((t) => t.key === shownKey));
  const format = roundFormat();
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
          <span class="ml-1 text-small font-normal opacity-75">{t.done}/{t.total}</span>
        </button>
      {/each}
    </div>

    {#if shown && (format?.canEdit || format?.map?.[shown.key])}
      <!-- The round's best-of (admins set it here too). -->
      <p class="flex items-center gap-1.5 text-small font-bold text-muted-foreground">
        {shown.label}<RoundBestOf key={shown.key} label={shown.label} />
      </p>
    {/if}
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
