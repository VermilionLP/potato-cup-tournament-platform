<script>
  // Pill tag. tone: neutral | brand | info | live | success | prize | special
  // (#lib/tags.js). `dot` adds the blinking live dot.
  import { cn } from "#lib/utils.js";
  import { tagClass } from "#lib/tags.js";

  let { tone = "neutral", dot = false, class: className, children, ...rest } = $props();
</script>

<span class={cn(tagClass(tone), className)} {...rest}>
  {#if dot}<span class="size-1.5 shrink-0 rounded-full bg-live animate-pulse" aria-hidden="true"></span>{/if}
  {@render children?.()}
</span>
