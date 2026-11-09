<script>
  // A setting that is on or off, as a card: icon, title, description and a
  // switch; `children` shows under it while it is on.
  let { checked = $bindable(false), title, description = "", icon: Icon = null, children } = $props();
</script>

<div class="rounded-xl border transition-colors {checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/40'}">
  <label class="flex cursor-pointer items-start gap-3 p-3">
    {#if Icon}
      <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {checked ? 'bg-primary/15 text-brand-ink' : 'bg-muted text-muted-foreground'}">
        <Icon class="h-4 w-4" />
      </span>
    {/if}
    <span class="min-w-0 flex-1">
      <span class="block text-sm font-semibold text-foreground">{title}</span>
      {#if description}<span class="mt-0.5 block text-small leading-relaxed text-muted-foreground">{description}</span>{/if}
    </span>
    <input type="checkbox" bind:checked class="peer sr-only" />
    <span
      aria-hidden="true"
      class="relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 {checked ? 'bg-primary' : 'bg-muted-foreground/30'}"
    >
      <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all {checked ? 'left-[1.125rem]' : 'left-0.5'}"></span>
    </span>
  </label>
  {#if checked && children}
    <div class="border-t border-border/60 px-3 pb-3 pt-3">{@render children()}</div>
  {/if}
</div>
