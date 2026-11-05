<script>
  // Placeholder blocks shaped like the page that is loading, instead of a
  // spinner on an empty page. `kind`: "event" (header + tabs + bracket),
  // "lobby" (hero + event rows), "table" (filters + rows), "stats" (tiles +
  // table + boards), "profile" (player card + panels). `label` is read out
  // to screen readers.
  let { kind = "table", label = "正在加载…", rows = 8 } = $props();
</script>

{#snippet bar(cls)}
  <div class="skeleton rounded-md {cls}"></div>
{/snippet}

<div class="space-y-5" aria-busy="true" role="status">
  <span class="sr-only">{label}</span>
  {#if kind === "event"}
    <div class="space-y-3 rounded-2xl border border-border bg-card/40 p-5">
      {@render bar("h-7 w-2/3 max-w-md")}
      <div class="flex flex-wrap gap-2">
        {#each Array(5) as _, i (i)}{@render bar("h-5 w-16 rounded-full")}{/each}
      </div>
      {@render bar("h-14 w-full max-w-sm")}
    </div>
    <div class="flex gap-2">
      {#each Array(4) as _, i (i)}{@render bar("h-8 w-20")}{/each}
    </div>
    <div class="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
      {#each Array(8) as _, i (i)}{@render bar("h-[76px] w-full")}{/each}
    </div>
  {:else if kind === "lobby"}
    {@render bar("h-40 w-full rounded-2xl")}
    {#each Array(4) as _, i (i)}
      <div class="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
        {@render bar("h-10 w-10 rounded-lg")}
        <div class="flex-1 space-y-2">{@render bar("h-4 w-1/2")}{@render bar("h-3 w-1/3")}</div>
        {@render bar("h-7 w-16")}
      </div>
    {/each}
  {:else if kind === "stats"}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each Array(4) as _, i (i)}{@render bar("h-20 w-full rounded-xl")}{/each}
    </div>
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-2 lg:col-span-2">
        {#each Array(rows) as _, i (i)}{@render bar("h-10 w-full")}{/each}
      </div>
      <div class="space-y-3">
        {#each Array(3) as _, i (i)}{@render bar("h-40 w-full rounded-xl")}{/each}
      </div>
    </div>
  {:else if kind === "profile"}
    <div class="flex items-center gap-4 rounded-2xl border border-border bg-card/40 p-5">
      {@render bar("h-16 w-16 rounded-2xl")}
      <div class="flex-1 space-y-2">{@render bar("h-6 w-48")}{@render bar("h-4 w-32")}</div>
      {@render bar("hidden h-16 w-40 sm:block")}
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      {#each Array(4) as _, i (i)}{@render bar("h-36 w-full rounded-xl")}{/each}
    </div>
  {:else}
    <div class="flex flex-wrap gap-2">
      {@render bar("h-9 w-56")}{@render bar("h-9 w-24")}{@render bar("h-9 w-24")}
    </div>
    <div class="overflow-hidden rounded-xl border border-border">
      {#each Array(rows) as _, i (i)}
        <div class="flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-0">
          {@render bar("h-4 w-5")}{@render bar("h-4 w-6")}{@render bar("h-4 flex-1 max-w-48")}
          <span class="flex-1"></span>{@render bar("h-4 w-12")}{@render bar("hidden h-4 w-16 sm:block")}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .skeleton {
    background: linear-gradient(90deg, var(--muted) 25%, color-mix(in oklab, var(--muted) 55%, var(--background)) 50%, var(--muted) 75%);
    background-color: var(--muted);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  @keyframes shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
