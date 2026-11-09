<script>
  // Round avatar with a player's initials: neutral grey (colour carries no
  // meaning here), brand-tinted for the signed-in player.
  import { userState } from "#lib/user.svelte.js";

  let { player, size = "w-8 h-8" } = $props();
</script>

<div
  data-no-i18n
  class="{size} rounded-full {player.id === userState.id ? 'bg-brand-soft text-brand-soft-foreground' : 'bg-secondary text-secondary-foreground'} flex items-center justify-center text-label font-bold uppercase shrink-0"
>
  {(player.display_name || player.id).slice(0, 2)}
</div>
