<script>
  // "显示更多" under a long board (#lib/expand-row.js visibleRows).
  import { PAGE_SIZE } from "#lib/expand-row.js";

  let { shown = 0, total = 0, onmore, onall } = $props();
  let left = $derived(total - shown);
</script>

{#if left > 0}
  <div class="flex flex-wrap items-center justify-center gap-3 border-t border-border/60 px-3 py-2.5 text-xs">
    <span class="text-muted-foreground">显示 {shown} / {total} 名</span>
    <button type="button" onclick={onmore} class="font-semibold text-primary hover:underline cursor-pointer">
      再显示 {Math.min(PAGE_SIZE, left)} 名
    </button>
    {#if left > PAGE_SIZE}
      <button type="button" onclick={onall} class="text-muted-foreground hover:text-foreground hover:underline cursor-pointer">全部显示</button>
    {/if}
  </div>
{/if}
