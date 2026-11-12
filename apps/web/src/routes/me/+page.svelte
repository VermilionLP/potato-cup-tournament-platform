<script>
  // 我的: the signed-in player's own page. What needs them now (the live
  // reminders), their events still to play and ones they could join
  // (#lib/my-page.js), their profile, MMR and this season in numbers (with
  // the recap image), and their achievements. Visitors are asked to set
  // their player ID first. The full record stays on /player/:id.
  import { onMount } from "svelte";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { reminders } from "#lib/reminders.svelte.js";
  import { itemText } from "#lib/reminders.js";
  import { openProfile } from "#lib/profile-prompt.js";
  import { countdownLabel } from "#lib/lobby.js";
  import { eventStatusLabel } from "#lib/event-view.js";
  import { myActiveEvents, openToJoin } from "#lib/my-page.js";
  import { lazy } from "#lib/lazy.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import Flag from "#lib/components/Flag.svelte";
  import PlayerAchievements from "#lib/components/players/PlayerAchievements.svelte";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import BellIcon from "@lucide/svelte/icons/bell";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ChartIcon from "@lucide/svelte/icons/chart-column";
  import ImageIcon from "@lucide/svelte/icons/image";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  const loadRecapDialog = lazy(() => import("#lib/components/players/SeasonRecapDialog.svelte"));

  let id = $derived(userState.id || "");
  let profile = $state(null);
  let ladder = $state(null);
  let recap = $state(null);
  let allEvents = $state([]);
  let loading = $state(true);
  let recapOpen = $state(false);
  let now = $state(Date.now());

  async function load(playerId) {
    loading = true;
    try {
      const [p, l, r, t] = await Promise.all([
        API.getPlayer(playerId).catch(() => null),
        API.getLadderPlayer(playerId).catch(() => null),
        API.getSeasonRecap(playerId).catch(() => null),
        API.listTournaments().catch(() => []),
      ]);
      if (playerId !== id) return;
      profile = p;
      ladder = l;
      recap = r;
      allEvents = Array.isArray(t) ? t : [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (id) load(id);
    else loading = false;
  });
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  let mine = $derived(myActiveEvents(profile?.tournaments || []));
  let joinable = $derived(openToJoin(allEvents, profile?.tournaments || []));
  let todo = $derived(reminders.items.map((i) => ({ key: i.key, ...itemText(i, now) })));
  // The contact is only public to admins; the header knows the visitor's own.
  let missing = $derived(!profile?.flag || !userState.qqGroup);
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const STATUS_TONE = { in_progress: "text-brand-ink font-bold", registration: "text-emerald-600 dark:text-emerald-400", voting: "text-sky-600 dark:text-sky-400" };
</script>

<svelte:head><title>我的 · Potato Cup</title></svelte:head>

{#snippet eventRow(t)}
  {@const left = countdownLabel(t, now)}
  <a href="/tournament/{encodeURIComponent(t.id)}" class="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
    <span class="min-w-0 flex-1">
      <span class="block truncate font-semibold" data-no-i18n>{t.name}</span>
      <span class="flex flex-wrap gap-x-2 text-small text-muted-foreground">
        <span class={STATUS_TONE[t.status] || ""}>{eventStatusLabel(t.status)}</span>
        {#if left && t.status !== "in_progress"}<span>{left}</span>{/if}
      </span>
    </span>
    <ChevronRightIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
  </a>
{/snippet}

<div class="space-y-6">
  <PageHeader title="我的" icon={UserRoundIcon} description="需要你处理的事、你报名的赛事、你的天梯分和本赛季成绩" />

  {#if !id}
    <EmptyState title="还没有设置选手 ID" hint="填上你的游戏内昵称、国籍和联系方式后，这里会显示你的赛事、待办提醒和成绩。">
      <Button onclick={openProfile} class="mt-2">设置选手 ID</Button>
    </EmptyState>
  {:else if loading && !profile}
    <PageSkeleton kind="stats" label="加载中..." />
  {:else}
    <!-- Who I am -->
    <Card.Root class="gap-0 py-0">
      <div class="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-amber-600 text-base font-black uppercase text-white" data-no-i18n>{id.slice(0, 2)}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <Flag code={profile?.flag} size={18} />
            <span class="truncate text-lg font-black" data-no-i18n>{profile?.display_name || id}</span>
            {#if profile?.team}<span class="shrink-0 text-xs font-semibold text-muted-foreground" data-no-i18n>[{profile.team}]</span>{/if}
          </div>
          <div class="mt-0.5 flex flex-wrap gap-x-3 text-small text-muted-foreground">
            {#if ladder?.games}
              <span>天梯 {ladder.mmr} · {ladder.tier?.name || ""}</span>
            {:else}
              <span>还没有天梯分</span>
            {/if}
            {#if userState.qqGroup}<span>联系方式 {userState.qqGroup}</span>{/if}
          </div>
        </div>
        <div class="flex basis-full flex-wrap gap-2 sm:basis-auto">
          <Button size="sm" variant="outline" onclick={openProfile} class="gap-1.5"><PencilIcon class="h-3.5 w-3.5" />编辑资料</Button>
          <Button size="sm" variant="outline" href="/player/{encodeURIComponent(id)}" class="gap-1.5">选手主页<ChevronRightIcon class="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {#if missing}
        <button type="button" onclick={openProfile} class="flex w-full items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-left text-small text-amber-700 hover:bg-amber-500/15 dark:text-amber-300 cursor-pointer">
          <TriangleAlertIcon class="h-3.5 w-3.5 shrink-0" />资料还不完整：报名前需要填写国籍和 QQ / Discord 联系方式。
        </button>
      {/if}
    </Card.Root>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- What needs me now -->
      <Card.Root class="gap-0 py-0">
        <div class="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold"><BellIcon class="h-4 w-4 text-brand-ink" />需要你处理</div>
        {#each todo as t (t.key)}
          <a href={t.url} class="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-0 hover:bg-muted/40">
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold">{t.title}</span>
              <span class="block text-small text-muted-foreground">{t.body}</span>
            </span>
            <span class="shrink-0 text-small font-semibold text-brand-ink">{t.action}</span>
          </a>
        {:else}
          <p class="px-4 py-6 text-center text-small text-muted-foreground">现在没有需要你处理的事。轮到你比赛、确认比分或签到时会显示在这里。</p>
        {/each}
      </Card.Root>

      <!-- My events -->
      <Card.Root class="gap-0 py-0">
        <div class="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold"><CalendarIcon class="h-4 w-4 text-brand-ink" />我的赛事</div>
        <div class="divide-y divide-border/50">
          {#each mine as t (t.id)}
            {@render eventRow(t)}
          {:else}
            <p class="px-4 py-4 text-center text-small text-muted-foreground">你还没有报名进行中或即将开始的赛事。</p>
          {/each}
        </div>
        {#if joinable.length}
          <div class="border-t border-border bg-muted/20 px-4 pb-1 pt-2.5 text-small font-semibold text-muted-foreground">可以报名</div>
          <div class="divide-y divide-border/50 bg-muted/20">
            {#each joinable as t (t.id)}
              {@render eventRow(t)}
            {/each}
          </div>
        {/if}
      </Card.Root>
    </div>

    <!-- This season -->
    {#if recap}
      <Card.Root class="gap-0 py-0">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span class="flex items-center gap-2 text-sm font-bold"><ChartIcon class="h-4 w-4 text-brand-ink" />{recap.season} 赛季</span>
          <div class="flex gap-2">
            <a href="/season/{recap.season}" class="text-small font-semibold text-muted-foreground hover:text-brand-ink">赛季总览</a>
            {#if recap.events}
              <button type="button" onclick={() => (recapOpen = true)} class="inline-flex items-center gap-1 text-small font-semibold text-brand-ink hover:underline cursor-pointer"><ImageIcon class="h-3.5 w-3.5" />生成回顾图</button>
            {/if}
          </div>
        </div>
        {#if recap.events}
          <dl class="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-5">
            {#each [["年度积分", recap.points?.total ? `${recap.points.total}` : "—", recap.points?.total ? `第 ${recap.points.rank} 名 / ${recap.points.of} 人` : ""], ["参赛", `${recap.events}`, recap.podiums ? `${recap.podiums} 次前三` : ""], ["战绩", `${recap.wins}-${recap.losses}`, `胜率 ${pct(recap.win_rate)}`], ["冠军", `${recap.titles}`, ""], ["最长连胜", `${recap.best_streak}`, ""]] as [label, value, sub] (label)}
              <div class="bg-card px-4 py-3">
                <dt class="text-small text-muted-foreground">{label}</dt>
                <dd class="num text-xl font-black">{value}</dd>
                {#if sub}<dd class="text-small text-muted-foreground">{sub}</dd>{/if}
              </div>
            {/each}
          </dl>
        {:else}
          <p class="px-4 py-6 text-center text-small text-muted-foreground">{recap.season} 赛季还没有参赛记录</p>
        {/if}
      </Card.Root>
    {/if}

    <PlayerAchievements playerId={id} />

    <a href="/players" class="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm font-semibold hover:border-primary/40 hover:text-brand-ink">
      <UsersIcon class="h-4 w-4" /><span class="flex-1">查找其他选手</span><ChevronRightIcon class="h-4 w-4 text-muted-foreground" />
    </a>
  {/if}
</div>

{#if recapOpen && recap}
  {#await loadRecapDialog() then m}
    <m.default playerId={id} season={recap.season} bind:open={recapOpen} />
  {/await}
{/if}
