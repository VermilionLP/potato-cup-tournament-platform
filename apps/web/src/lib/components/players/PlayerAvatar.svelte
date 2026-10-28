<script>
  // Round avatar with a player's initials.
  import { playerGradient } from "$lib/players.js";

  let { player, size = "w-8 h-8" } = $props();
</script>

<div
  data-no-i18n
  class="{size} rounded-full bg-gradient-to-br {playerGradient(player.id)} flex items-center justify-center text-[11px] font-bold text-white uppercase shrink-0"
>
  {(player.display_name || player.id).slice(0, 2)}
</div>
