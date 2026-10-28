<script>
  // Segmented control: options [{ id, label, sub?, title?, disabled? }].
  let { options = [], value, onpick, cols = "grid-cols-3" } = $props();
</script>

<div class="grid {cols} gap-1 rounded-lg bg-muted/50 p-1">
  {#each options as opt (opt.id)}
    <button
      type="button"
      disabled={opt.disabled}
      onclick={() => onpick(opt.id)}
      title={opt.title}
      class="rounded-md px-2 py-1.5 text-xs font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40
        {value === opt.id ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}"
    >
      {opt.label}
      {#if opt.sub}<span class="ml-0.5 text-[10px] font-normal opacity-70">{opt.sub}</span>{/if}
    </button>
  {/each}
</div>
