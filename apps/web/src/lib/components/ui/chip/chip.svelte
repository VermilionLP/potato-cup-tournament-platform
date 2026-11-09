<script>
  // Filter chip (pill button, 32px). Selected = solid brand orange.
  // `count` shows "label · n".
  import { cn } from "#lib/utils.js";

  let { selected = false, count = undefined, class: className, children, ...rest } = $props();
</script>

<button
  type="button"
  aria-pressed={selected}
  class={cn(
    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-small font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
    selected
      ? "border-primary bg-primary font-bold text-primary-foreground"
      : "border-input bg-transparent text-secondary-foreground hover:bg-muted hover:text-foreground",
    className,
  )}
  {...rest}
>
  {@render children?.()}
  {#if count !== undefined}<span class="num opacity-70">· {count}</span>{/if}
</button>
