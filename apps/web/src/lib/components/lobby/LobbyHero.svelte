<script>
  // Top of the lobby: the event that matters now (featuredEvent in
  // #lib/lobby.js) as one big card, with a live countdown, the sign-up bar,
  // the prize pool and one button for what to do: sign up (one click once
  // the visitor has an ID; their own ladder limit is checked by the
  // server), vote on the time, or follow the bracket.
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { needsProfile } from "#lib/profile-prompt.js";
  import { countdown } from "#lib/datetime.js";
  import { beijingTitle, displayCapacity, eventGradient, scheduledDateTime, startTimeLabel, statusLabel } from "#lib/lobby.js";
  import { prizeTotal } from "#lib/points.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import EventTags from "./EventTags.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CoinsIcon from "@lucide/svelte/icons/coins";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let { t, onchanged, isAdmin = false, ondelete } = $props();

  let href = $derived(`/tournament/${encodeURIComponent(t.id)}`);
  // The event's players (to know whether the visitor is in) and matches (live ones).
  let detail = $state(null);
  $effect(() => {
    const id = t.id;
    detail = null;
    API.getTournament(id)
      .then((d) => (detail = d))
      .catch(() => {});
  });
  let registered = $derived(Boolean(userState.id && detail?.players?.some((p) => p.player_id === userState.id || p.id === userState.id)));
  let liveCount = $derived((detail?.matches || []).filter((m) => m.status === "pending" && m.player1_id && m.player2_id).length);

  let now = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(timer);
  });
  let start = $derived(scheduledDateTime(t));
  let clock = $derived(start ? countdown(start, now) : null);
  let capacity = $derived(displayCapacity(t));
  let filled = $derived(Math.min(100, ((t.player_count || 0) / (capacity || 1)) * 100));
  let prize = $derived(prizeTotal(t.points_table || []));

  let busy = $state(false);
  async function signUp() {
    if (needsProfile()) return;
    busy = true;
    try {
      await API.register(t.id, userState.id);
      toast.success("报名成功");
      detail = await API.getTournament(t.id).catch(() => detail);
      await onchanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }
</script>

<section class="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
  <!-- Colour wash from the event's gradient -->
  <div class="pointer-events-none absolute inset-0 bg-gradient-to-br {eventGradient(t.id)} opacity-[0.12]"></div>
  <div class="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br {eventGradient(t.id)} opacity-20 blur-3xl"></div>

  <div class="relative grid gap-5 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
    <div class="min-w-0 space-y-3">
      <div class="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        {#if t.status === "in_progress"}
          <span class="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-red-600 dark:text-red-400">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>正在进行
          </span>
        {:else}
          <span class="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{statusLabel(t.status)}</span>
        {/if}
        <span class="text-muted-foreground">下一场比赛</span>
      </div>
      <a {href} class="block text-2xl font-black leading-tight tracking-tight text-foreground hover:text-primary sm:text-3xl">{t.name}</a>
      <EventTags {t} />
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {#if t.scheduled_time}
          <span class="inline-flex items-center gap-1.5" title={beijingTitle(t.scheduled_time)}>
            <ClockIcon class="h-3.5 w-3.5" />{startTimeLabel(t.scheduled_time)}
          </span>
        {/if}
        {#if prize > 0}
          <span class="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
            <CoinsIcon class="h-3.5 w-3.5" />奖池 {prize.toLocaleString()} 金鹰币
          </span>
        {/if}
      </div>
      {#if t.status !== "voting"}
        <div class="max-w-md space-y-1">
          <div class="flex items-center justify-between text-[11px] font-semibold">
            <span class="inline-flex items-center gap-1 text-muted-foreground"><UsersIcon class="h-3.5 w-3.5" />已报名</span>
            <span class="tabular-nums text-foreground">{t.player_count || 0} / {capacity}</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full bg-gradient-to-r {eventGradient(t.id)} transition-[width] duration-700" style="width: {filled}%"></div>
          </div>
        </div>
      {:else}
        <p class="text-xs text-muted-foreground">{t.voter_count || 0} 人已投票，比赛时间由投票决定</p>
      {/if}
    </div>

    <!-- Countdown and the one action -->
    <div class="flex flex-col items-stretch gap-3 md:min-w-56 md:items-end">
      {#if clock}
        <div class="md:text-right">
          <div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{clock.phase === "before" ? "距离开赛" : "比赛中"}</div>
          <div class="text-3xl font-black tabular-nums tracking-tight {clock.soon ? 'text-red-500' : 'text-foreground'}">
            {clock.phase === "before" ? clock.text : clock.text.replace("已开赛 ", "")}
          </div>
        </div>
      {/if}
      {#if t.status === "registration"}
        {#if registered}
          <div class="flex gap-2 md:justify-end">
            <span class="inline-flex h-10 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <CheckIcon class="h-4 w-4" />已报名
            </span>
            <Button variant="outline" class="h-10" onclick={() => goto(href)}>查看赛事</Button>
          </div>
        {:else}
          <Button class="h-10 gap-1.5 text-sm font-bold" disabled={busy || !detail} onclick={signUp}>
            {busy ? "报名中…" : userState.id ? `以 ${userState.id} 报名` : "立即报名"}
          </Button>
        {/if}
      {:else if t.status === "voting"}
        <Button class="h-10 gap-1.5 text-sm font-bold" onclick={() => goto(href)}>去投票 <ArrowRightIcon class="h-4 w-4" /></Button>
      {:else}
        <Button class="h-10 gap-1.5 text-sm font-bold" onclick={() => goto(`${href}#bracket`)}>
          <RadioIcon class="h-4 w-4" />看对阵
          {#if liveCount}<span class="font-normal opacity-80">· {liveCount} 场可开打</span>{/if}
        </Button>
      {/if}
      <!-- Admins: a quiet link under the main action, away from it -->
      {#if isAdmin}
        <button
          type="button"
          onclick={() => ondelete?.(t)}
          class="inline-flex items-center gap-1 self-center rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/70 hover:bg-red-500/10 hover:text-red-500 cursor-pointer md:self-end"
          aria-label="删除赛事 {t.name}"
        >
          <Trash2Icon class="h-3.5 w-3.5" />删除赛事
        </button>
      {/if}
    </div>
  </div>
</section>
