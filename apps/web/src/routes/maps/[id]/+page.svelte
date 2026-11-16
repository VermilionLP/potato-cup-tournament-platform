<script>
  // One 比赛地图: the link to make a custom battle room, the main settings,
  // the vehicles each team may take and the events that use it. Admins edit
  // it below (MissionEditor).
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Tag } from "#lib/components/ui/tag/index.js";
  import MissionHowTo from "#lib/components/maps/MissionHowTo.svelte";
  import MissionEditor from "#lib/components/maps/MissionEditor.svelte";
  import MissionThumb from "#lib/components/maps/MissionThumb.svelte";
  import { levelName } from "@potato-cup/shared/mission-blk.js";
  import MapPinIcon from "@lucide/svelte/icons/map-pin";
  import { copyText, fileSize, missionFacts, missionFile, missionLink, modeLabels, vehicleLists } from "#lib/missions.js";
  import { eventStatusLabel } from "#lib/event-view.js";
  import MapIcon from "@lucide/svelte/icons/map";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";

  let isAdmin = $derived(!!userState.adminToken);
  let data = $state(null);
  let loading = $state(true);
  let missing = $state(false);

  const id = $derived(page.params.id);
  const mission = $derived(data?.mission);
  const summary = $derived(mission?.summary);
  const link = $derived(mission ? missionLink(mission.id) : "");
  const lists = $derived(vehicleLists(summary));

  async function load() {
    try {
      data = await API.getMission(id);
      missing = false;
    } catch (e) {
      if (e.status === 404) missing = true;
      else toast.error("加载地图失败: " + e.message);
    } finally {
      loading = false;
    }
  }
  let loadedFor = "";
  $effect(() => {
    const key = `${id}|${isAdmin}`;
    if (key === loadedFor) return;
    loadedFor = key;
    load();
  });

  async function copy() {
    if (await copyText(link)) toast.success("已复制开房链接");
    else toast.error("复制失败，请手动复制链接");
  }
</script>

<svelte:head><title>{mission ? `${mission.name} · Potato Cup` : "比赛地图 · Potato Cup"}</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-5 px-4 py-6">
  <a href="/maps" class="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />比赛地图</a>

  {#if loading}
    <PageSkeleton kind="profile" />
  {:else if missing || !mission}
    <EmptyState icon={MapIcon} title="没有这个地图" hint="可能已经删除或隐藏了。" />
  {:else}
    <header class="grid gap-4 border-b border-border/60 pb-5 sm:grid-cols-[minmax(0,22rem)_1fr] sm:items-end">
      <MissionThumb {mission} eager class="rounded-xl border border-border" />
      <div class="min-w-0 space-y-1.5">
        {#if mission.location || summary?.level}
          <p class="flex items-center gap-1 text-sm font-semibold text-muted-foreground"><MapPinIcon class="size-4" /><span data-no-i18n>{mission.location || levelName(summary?.level)}</span></p>
        {/if}
        <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl" data-no-i18n>{mission.name}</h1>
        <div class="flex flex-wrap items-center gap-1.5">
          {#each modeLabels(summary) as m (m)}<Tag tone="info">{m}</Tag>{/each}
          {#if mission.hidden}<Tag><EyeOffIcon class="size-3" />已隐藏</Tag>{/if}
          <span class="text-small text-muted-foreground">第 {mission.version} 版 · {fileSize(mission.size)}</span>
        </div>
      </div>
    </header>

    <!-- The link for 自定义战斗 → Missions by URL. -->
    <section class="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p class="text-sm font-bold text-brand-ink">开房链接</p>
      <div class="flex flex-wrap gap-2">
        <input class="field w-full basis-full min-w-0 font-mono text-xs sm:basis-auto sm:w-auto sm:flex-1" readonly value={link} onfocus={(e) => e.currentTarget.select()} aria-label="开房链接" />
        <Button onclick={copy}><CopyIcon class="size-4" />复制</Button>
        <Button variant="outline" href={missionFile(mission.id)} download="{mission.id}.blk"><DownloadIcon class="size-4" />下载 .blk</Button>
      </div>
      <details class="group">
        <summary class="cursor-pointer select-none text-small font-semibold text-brand-ink/90 hover:text-brand-ink">怎么用这个链接开房</summary>
        <MissionHowTo class="mt-2" />
      </details>
    </section>

    {#if summary}
      <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {#each missionFacts(summary) as [label, value] (label)}
          <div class="bg-card px-3.5 py-2.5">
            <dt class="text-small font-semibold text-muted-foreground">{label}</dt>
            <dd class="mt-0.5 truncate text-sm font-bold" data-no-i18n={label === "场景" ? "" : undefined}>{value}</dd>
          </div>
        {/each}
      </dl>
    {:else}
      <p class="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">{isAdmin ? "地图文件读不出来，请在下面的「原文」里修改，或恢复旧版本。" : "地图文件读不出来。"}</p>
    {/if}

    {#if mission.description || mission.credit || mission.source_url}
      <section class="space-y-1.5">
        {#if mission.description}<p class="whitespace-pre-line text-sm leading-relaxed" data-no-i18n>{mission.description}</p>{/if}
        {#if mission.credit}<p class="text-small text-muted-foreground">作者 / 出处：<span data-no-i18n>{mission.credit}</span></p>{/if}
        {#if mission.source_url}
          <a href={mission.source_url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-small font-semibold text-brand-ink hover:underline">原始链接<ExternalLinkIcon class="size-3" /></a>
        {/if}
      </section>
    {/if}

    {#if summary && !lists}
      <section class="space-y-1">
        <h2 class="text-sm font-bold">可用载具</h2>
        <p class="text-sm text-muted-foreground">不限制载具：玩家用自己的载具，按房间设置。</p>
      </section>
    {/if}
    {#if lists}
      <section class="space-y-2">
        <h2 class="text-sm font-bold">可用载具</h2>
        {#each lists.same ? [["两队", lists.teamA]] : [["A 队", lists.teamA], ["B 队", lists.teamB]] as [team, units] (team)}
          <div class="space-y-1.5">
            <p class="text-small font-semibold text-muted-foreground">{team === "两队" ? `两队（${units.length} 种）` : team === "A 队" ? `A 队（${units.length} 种）` : `B 队（${units.length} 种）`}</p>
            <div class="flex flex-wrap gap-1.5">
              {#each units as u (u)}<span class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs" data-no-i18n>{u}</span>{/each}
            </div>
          </div>
        {/each}
      </section>
    {/if}

    {#if data.pools?.length}
      <section class="space-y-2">
        <h2 class="text-sm font-bold">使用这张地图的载具池</h2>
        <ul class="flex flex-wrap gap-2">
          {#each data.pools as p (p.id)}
            <li><a href="/pools?template={encodeURIComponent(p.id)}" class="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-muted/50" data-no-i18n>{p.name}</a></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if data.events?.length}
      <section class="space-y-2">
        <h2 class="text-sm font-bold">使用这张地图的赛事</h2>
        <ul class="flex flex-wrap gap-2">
          {#each data.events as ev (ev.id)}
            <li><a href="/tournament/{ev.id}" class="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-muted/50"><span data-no-i18n>{ev.name}</span><span class="text-small text-muted-foreground">{eventStatusLabel(ev.status)}</span></a></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if isAdmin}
      <MissionEditor {mission} versions={data.versions} previous={data.previous_limit} onchange={load} />
    {/if}
  {/if}
</div>
