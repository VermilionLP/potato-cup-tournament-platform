<script>
  // The header every top-level page uses, so they look alike: an icon tile,
  // the title (with an optional `badge` snippet next to it), one short line
  // under it (`description`, text or snippet), a folded 「说明」 for longer
  // explanations (`more` snippet) and buttons on the right (`actions`).
  let { title, icon: Icon = null, description = "", badge = null, more = null, actions = null } = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border/60 pb-4">
  <div class="flex min-w-0 flex-1 items-start gap-3">
    {#if Icon}
      <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-brand-ink">
        <Icon class="h-5 w-5" />
      </div>
    {/if}
    <div class="min-w-0 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {@render badge?.()}
      </div>
      {#if typeof description === "function"}
        <p class="text-xs text-muted-foreground">{@render description()}</p>
      {:else if description}
        <p class="text-xs text-muted-foreground">{description}</p>
      {/if}
      {#if more}
        <details class="group max-w-3xl text-xs text-muted-foreground">
          <summary class="inline-flex cursor-pointer select-none list-none items-center gap-1 font-semibold text-brand-ink/90 hover:text-brand-ink [&::-webkit-details-marker]:hidden">
            <span class="transition-transform group-open:rotate-90">›</span>说明
          </summary>
          <div class="mt-1.5 space-y-1.5 leading-relaxed">{@render more()}</div>
        </details>
      {/if}
    </div>
  </div>
  {#if actions}
    <div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
