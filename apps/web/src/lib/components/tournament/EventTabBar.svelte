<script>
  // The event page's tab bar (概览 / 对阵 / 载具池 / 选手 / 直播) with the
  // "分享到 Discord" button at the end.
  import Share2Icon from "@lucide/svelte/icons/share-2";

  let { tabs = [], active = "", onselect, onshare } = $props();
</script>

<!-- Scrolls sideways on narrow screens without showing a scrollbar; the
     baseline is an inset shadow so the tabs' underline needs no overflow. -->
<div
  class="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shadow-[inset_0_-1px_0_var(--border)]"
  role="tablist"
  aria-label="赛事页"
>
  {#each tabs as tb (tb.id)}
    <button
      type="button"
      role="tab"
      aria-selected={active === tb.id}
      onclick={() => onselect(tb.id)}
      class="shrink-0 border-b-2 px-3 py-2 text-sm font-semibold cursor-pointer transition-colors
        {active === tb.id ? 'border-primary text-brand-ink' : 'border-transparent text-muted-foreground hover:text-foreground'}"
    >
      {tb.label}{#if tb.count != null}<span class="ml-1 text-small font-normal opacity-70">{tb.count}</span>{/if}
    </button>
  {/each}
  <button
    type="button"
    onclick={onshare}
    class="ml-auto shrink-0 inline-flex items-center gap-1 px-2 sm:px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-brand-ink cursor-pointer"
    title="生成可以发到 Discord 的赛事公告或结果"
    aria-label="分享到 Discord"
  >
    <Share2Icon class="w-4 h-4 sm:w-3.5 sm:h-3.5" />
    <!-- Phones: the icon only, so it stays on screen. -->
    <span class="hidden sm:inline">分享到 Discord</span>
  </button>
</div>
