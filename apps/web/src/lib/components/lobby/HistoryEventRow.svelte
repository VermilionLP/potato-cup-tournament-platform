<script>
  // One finished event in the lobby's history list.
  import { goto } from "$app/navigation";
  import { beijingTitle, eventDate, relativeDay, startTimeLabel } from "#lib/lobby.js";
  import { Tag } from "#lib/components/ui/tag/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import EventTags from "./EventTags.svelte";
  import EventMark from "./EventMark.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let { t, isAdmin = false, ondelete, onexport } = $props();

  let href = $derived(`/tournament/${encodeURIComponent(t.id)}`);
</script>

<div
  role="button"
  tabindex="0"
  onclick={() => goto(href)}
  onkeydown={(e) => e.key === "Enter" && goto(href)}
  class="group flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 sm:p-4 hover:bg-muted/40 transition-colors cursor-pointer gap-2 sm:gap-3"
>
  <div class="flex items-center gap-3.5 min-w-0 flex-1">
    <EventMark tier={t.tier} size="sm" />
    <div class="min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 class="font-bold text-sm text-foreground group-hover:text-brand-ink transition-colors truncate max-w-[240px] sm:max-w-[360px]">
          {t.name}
        </h3>
        <Tag>已完结</Tag>
      </div>
      <EventTags {t} />
    </div>
  </div>

  <div class="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 sm:flex-nowrap pl-12 sm:pl-0">
    <div class="min-w-0">
      <div class="flex flex-wrap sm:grid sm:grid-cols-[205px_105px_110px] items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
        <div class="flex items-center gap-1 text-brand-ink font-bold whitespace-nowrap tabular-nums">
          <ClockIcon class="w-3.5 h-3.5 shrink-0" />
          <span title={beijingTitle(t.scheduled_time, false)}>{startTimeLabel(t.scheduled_time) || "时间未记录"}</span>
        </div>
        <div class="flex items-center gap-1 bg-muted/40 border border-border/60 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
          <UsersIcon class="w-3 h-3 text-muted-foreground/50 shrink-0" />
          <span>{t.player_count || 0} 人参赛</span>
        </div>
        <div class="hidden sm:flex items-center gap-1 font-semibold text-muted-foreground whitespace-nowrap">
          <span class="text-xs">✓</span>
          <span>{relativeDay(eventDate(t))}完赛</span>
        </div>
      </div>
      <div class="hidden sm:block text-small text-muted-foreground/50 mt-1 num">
        创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if isAdmin}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            ondelete?.(t);
          }}
          onkeydown={(e) => e.stopPropagation()}
          class="flex items-center justify-center w-7.5 h-7.5 rounded-full text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
          title="删除赛事"
          aria-label="删除赛事 {t.name}"
        >
          <Trash2Icon class="w-4 h-4" />
        </button>
      {/if}
      <Button
        variant="outline"
        size="sm"
        onclick={(e) => {
          e.stopPropagation();
          onexport?.(t);
        }}
        class="text-xs gap-1 px-2.5 h-7.5 hover:bg-secondary cursor-pointer border-border hover:text-foreground"
      >
        <DownloadIcon class="w-3 h-3" /> 导出
      </Button>
      <div class="hidden sm:flex items-center justify-center w-7.5 h-7.5 rounded-full bg-muted/30 group-hover:bg-muted group-hover:text-foreground transition-all duration-300">
        <ArrowRightIcon class="w-3.5 h-3.5" />
      </div>
    </div>
  </div>
</div>
