<script>
  // One filter of a page's filter bar: a small label and its options as a
  // pill segmented control. options: [{ id, label, count?, title? }].
  // Pages put several in one wrapping row (FilterBar), search on the right.
  let { label = "", options = [], value = "", disabled = false, onpick } = $props();
</script>

<div class="flex min-w-0 items-center gap-2" role="group" aria-label={label}>
  {#if label}<span class="label-caps shrink-0 text-muted-foreground">{label}</span>{/if}
  <div class="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-muted/60 p-0.5">
    {#each options as opt (opt.id)}
      <button
        type="button"
        aria-pressed={value === opt.id}
        title={opt.title}
        {disabled}
        onclick={() => onpick?.(opt.id)}
        class="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-3 text-small font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50
          {value === opt.id ? 'bg-primary font-bold text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'}"
      >
        {opt.label}
        {#if opt.count !== undefined}<span class="num opacity-70">{opt.count}</span>{/if}
      </button>
    {/each}
  </div>
</div>
