<script>
  // The event page's tab bar (概览 / 对阵 / 载具池 / 选手 / 直播) with one
  // "分享" button at the end: a menu with the bracket picture
  // (onsharebracket; off while there is no bracket to draw) and the
  // Discord post (onshare).
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Share2Icon from "@lucide/svelte/icons/share-2";
  import ImageIcon from "@lucide/svelte/icons/image";
  import MessageSquareTextIcon from "@lucide/svelte/icons/message-square-text";

  let { tabs = [], active = "", onselect, onshare, onsharebracket = null, finished = false } = $props();
  let open = $state(false);

  const pick = (fn) => {
    open = false;
    fn?.();
  };
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
  <Popover.Root bind:open>
    <Popover.Trigger
      class="ml-auto shrink-0 inline-flex items-center gap-1 px-2 sm:px-3 py-2 text-xs font-semibold cursor-pointer
        {open ? 'text-brand-ink' : 'text-muted-foreground hover:text-brand-ink'}"
      title="分享对阵图或赛事帖子"
      aria-label="分享"
    >
      <Share2Icon class="w-4 h-4 sm:w-3.5 sm:h-3.5" />
      <!-- Phones: the icon only, so it stays on screen. -->
      <span class="hidden sm:inline">分享</span>
    </Popover.Trigger>
    <Popover.Content align="end" class="w-64 gap-1 p-1.5">
      <button
        type="button"
        disabled={!onsharebracket}
        onclick={() => pick(onsharebracket)}
        class="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        <ImageIcon class="mt-0.5 size-4 shrink-0 text-brand-ink" />
        <span class="min-w-0">
          <span class="block text-sm font-bold">对阵分享图</span>
          <span class="block text-small text-muted-foreground">{onsharebracket ? "完整对阵生成一张图片，可下载或复制" : "还没有对阵，报名人数够了之后可以生成"}</span>
        </span>
      </button>
      <button type="button" onclick={() => pick(onshare)} class="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-muted cursor-pointer">
        <MessageSquareTextIcon class="mt-0.5 size-4 shrink-0 text-brand-ink" />
        <span class="min-w-0">
          <span class="block text-sm font-bold">分享到 Discord</span>
          <span class="block text-small text-muted-foreground">{finished ? "赛事结果帖子和结果图" : "赛事公告帖子，复制后直接粘贴"}</span>
        </span>
      </button>
    </Popover.Content>
  </Popover.Root>
</div>
