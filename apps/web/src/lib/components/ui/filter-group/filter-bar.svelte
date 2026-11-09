<script>
  // A page's filter row: FilterGroups on the left, wrapping; an optional
  // search (or other control) on the right.
  let { children, end } = $props();
</script>

<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
  {@render children?.()}
  {#if end}<div class="w-full sm:ml-auto sm:w-auto">{@render end()}</div>{/if}
</div>
