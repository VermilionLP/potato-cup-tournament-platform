<script>
  // The one "nothing here yet" block: an icon, a short title and a line on
  // what fills it. `compact` for small panels.
  import { cn } from "#lib/utils.js";
  import InboxIcon from "@lucide/svelte/icons/inbox";

  let { title, hint = "", icon: Icon = InboxIcon, compact = false, class: className, children } = $props();
</script>

<div
  class={cn(
    "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input text-center",
    compact ? "px-4 py-5" : "px-6 py-10",
    className,
  )}
>
  <Icon class={cn("text-muted-foreground/70", compact ? "size-5" : "size-7")} aria-hidden="true" />
  <p class={cn("font-bold", compact ? "text-small text-muted-foreground" : "text-body text-foreground")}>{title}</p>
  {#if hint}<p class="text-small text-muted-foreground">{hint}</p>{/if}
  {@render children?.()}
</div>
