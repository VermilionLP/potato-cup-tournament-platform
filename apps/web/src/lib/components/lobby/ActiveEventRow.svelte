<script>
  // One upcoming / running event in the lobby list.
  import { goto } from "$app/navigation";
  import { actionLabel, beijingTitle, countdownLabel, displayCapacity, eventGradient, startTimeLabel, statusLabel, statusStyle } from "$lib/lobby.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import EventTags from "./EventTags.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let { t, isAdmin = false, ondelete } = $props();

  let href = $derived(`/tournament/${encodeURIComponent(t.id)}`);
  let filled = $derived(t.status === "voting" ? t.voter_count || 0 : t.player_count || 0);
</script>

<div
  role="button"
  tabindex="0"
  onclick={() => goto(href)}
  onkeydown={(e) => e.key === "Enter" && goto(href)}
  class="group flex flex-col md:flex-row md:items-center justify-between p-4.5 hover:bg-muted/40 transition-colors cursor-pointer gap-4"
>
  <!-- Left: avatar + title -->
  <div class="flex items-center gap-4 min-w-0 flex-1">
    <div class="w-10 h-10 rounded-full bg-gradient-to-br {eventGradient(t.id)} flex items-center justify-center text-white shrink-0 shadow-sm border border-white/10">
      <TrophyIcon class="w-5 h-5 text-white" />
    </div>
    <div class="min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 class="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate max-w-[280px] sm:max-w-[400px]">
          {t.name}
        </h3>
        <Badge variant="outline" class="text-[9px] px-2 py-0 font-bold uppercase tracking-wider {statusStyle(t.status)} shrink-0">
          {statusLabel(t.status)}
        </Badge>
      </div>
      <EventTags {t} />
    </div>
  </div>

  <!-- Right: time, players, action -->
  <div class="flex items-center justify-between md:justify-end gap-6 shrink-0 flex-wrap md:flex-nowrap border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
    <div class="min-w-[205px]">
      {#if t.scheduled_time}
        <div class="flex items-center gap-1.5 text-primary text-xs font-bold whitespace-nowrap tabular-nums">
          <ClockIcon class="w-4 h-4 shrink-0 animate-pulse" />
          <span title={beijingTitle(t.scheduled_time)}>{startTimeLabel(t.scheduled_time)}</span>
        </div>
      {:else if t.status === "voting"}
        <div class="flex items-center gap-1.5 text-purple-400 text-xs font-semibold italic">
          <ClockIcon class="w-4 h-4 shrink-0" />
          <span>时间投票进行中...</span>
        </div>
      {:else}
        <div class="flex items-center gap-1.5 text-muted-foreground/60 text-xs font-medium italic">
          <ClockIcon class="w-4 h-4 text-muted-foreground/40 shrink-0" />
          <span>比赛时间待定...</span>
        </div>
      {/if}
      <div class="text-[10px] text-muted-foreground/50 mt-1 font-mono">
        {#if t.scheduled_time}
          <span class="text-primary/80 font-bold">{countdownLabel(t)}</span>
          <span class="mx-1">·</span>
        {/if}
        创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}
      </div>
    </div>

    <div class="flex items-center gap-3 w-[170px]">
      <div class="flex items-center gap-1 text-xs text-muted-foreground font-semibold shrink-0" title={`报名上限 ${t.player_capacity} 人`}>
        <UsersIcon class="w-3.5 h-3.5" />
        {#if t.status === "voting"}
          <span>{t.voter_count || 0} 人投票</span>
        {:else}
          <span>{t.player_count || 0} / {displayCapacity(t)}</span>
        {/if}
      </div>
      <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
          style="width: {Math.min(100, (filled / displayCapacity(t)) * 100)}%"
        ></div>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      {#if isAdmin}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            ondelete?.(t);
          }}
          onkeydown={(e) => e.stopPropagation()}
          class="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
          title="删除赛事"
          aria-label="删除赛事 {t.name}"
        >
          <Trash2Icon class="w-4 h-4" />
        </button>
      {/if}
      <div class="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/70 group-hover:text-primary transition-colors">
        <span>{actionLabel(t)}</span>
        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
          <ArrowRightIcon class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </div>
  </div>
</div>
