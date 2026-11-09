<script>
  // Number tile: an uppercase label, a big condensed number and a note.
  // tone colours the number: default | prize | win | loss | brand.
  import { cn } from "#lib/utils.js";

  let { label, value, note = "", tone = "default", class: className, valueClass = "", children } = $props();
  const TONE = { default: "text-foreground", prize: "text-amber-600 dark:text-prize", win: "text-green-600 dark:text-win", loss: "text-loss", brand: "text-brand-ink" };
</script>

<div class={cn("flex min-w-0 flex-col gap-1 rounded-xl bg-muted p-3.5", className)}>
  <span class="label-caps text-muted-foreground truncate">{label}</span>
  <span class={cn("font-display text-4xl font-extrabold leading-none tabular-nums", TONE[tone] || TONE.default, valueClass)}>{value}</span>
  {#if note}<span class="text-small text-muted-foreground truncate">{note}</span>{/if}
  {@render children?.()}
</div>
