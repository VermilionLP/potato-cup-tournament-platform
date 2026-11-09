<script>
  // An event's mark in the lobby lists: its tier letter in the tier's
  // colour (S-D, #lib/tags.js), or a grey trophy for an event without one.
  import { TIER_TAG } from "#lib/tournament.js";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let { tier = "", size = "md" } = $props();
  let box = $derived(size === "sm" ? "size-9 text-xl" : "size-10 text-2xl");
</script>

{#if tier && TIER_TAG[tier]}
  <span class="{box} {TIER_TAG[tier]} inline-flex shrink-0 items-center justify-center rounded-xl font-display font-extrabold leading-none" title="{tier} 级赛事">{tier}</span>
{:else}
  <span class="{box} inline-flex shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground/70">
    <TrophyIcon class="size-[45%]" />
  </span>
{/if}
