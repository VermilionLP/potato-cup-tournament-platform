<script>
  // "加入 Discord": opens the server invite in a new tab. `variant`:
  // "solid" (Discord blurple, the main action) or "outline" (a header
  // button next to others).
  import { DISCORD_INVITE } from "#lib/discord.svelte.js";
  import DiscordIcon from "./DiscordIcon.svelte";

  let { variant = "solid", label = "加入 Discord", class: className = "", onclick = null } = $props();
</script>

<a
  href={DISCORD_INVITE}
  target="_blank"
  rel="noopener noreferrer"
  {onclick}
  class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition-colors
    {variant === 'solid'
      ? 'bg-[#5865F2] text-white shadow-sm hover:bg-[#4752C4]'
      : 'border border-[#5865F2]/35 bg-background text-[#4752C4] hover:bg-[#5865F2]/10 dark:text-[#a5acff]'}
    {className}"
>
  <DiscordIcon class="size-4" />
  {label}
</a>
