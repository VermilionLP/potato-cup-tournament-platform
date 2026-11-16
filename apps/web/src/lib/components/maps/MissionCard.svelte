<script>
  // One 比赛地图 on /maps, /pools and event pages: its picture, name and
  // place, the main settings, and the link to paste into 自定义战斗 →
  // Missions by URL.
  import { toast } from "svelte-sonner";
  import { Button } from "#lib/components/ui/button/index.js";
  import { copyText, missionFacts, missionFile, missionLink, modeLabels } from "#lib/missions.js";
  import { levelName } from "@potato-cup/shared/mission-blk.js";
  import MissionThumb from "./MissionThumb.svelte";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";
  import MapPinIcon from "@lucide/svelte/icons/map-pin";

  let { mission, compact = false } = $props();

  const summary = $derived(mission.summary);
  const modes = $derived(modeLabels(summary));
  // The place is on the picture already; the facts start after it.
  const facts = $derived(missionFacts(summary).filter(([label]) => label !== "场景"));
  const place = $derived(mission.location || levelName(summary?.level));

  async function copy() {
    if (await copyText(missionLink(mission.id))) toast.success("已复制开房链接：自定义战斗 → 创建房间 → Missions by URL → 粘贴");
    else toast.error("复制失败，请手动复制链接");
  }
</script>

<article class="flex flex-col overflow-hidden rounded-xl border border-border bg-card {mission.hidden ? 'opacity-70' : ''}">
  <a href="/maps/{mission.id}" class="group relative block" aria-label={mission.name}>
    <MissionThumb {mission} class="transition-transform duration-300 group-hover:scale-[1.02]" />
    <div class="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
      {#each modes as m (m)}<span class="rounded-md bg-black/55 px-2 py-0.5 text-small font-semibold text-white backdrop-blur-sm">{m}</span>{/each}
      {#if mission.hidden}<span class="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-small font-semibold text-white"><EyeOffIcon class="size-3" />已隐藏</span>{/if}
      {#if !summary}<span class="rounded-md bg-loss px-2 py-0.5 text-small font-semibold text-white">文件读不出来</span>{/if}
    </div>
  </a>

  <div class="flex flex-1 flex-col gap-3 p-4">
    <div class="min-w-0">
      <a href="/maps/{mission.id}" class="block truncate text-base font-bold leading-snug hover:text-brand-ink" data-no-i18n>{mission.name}</a>
      {#if place}
        <p class="mt-0.5 flex items-center gap-1 truncate text-small text-muted-foreground"><MapPinIcon class="size-3 shrink-0" /><span class="truncate" data-no-i18n>{place}</span></p>
      {/if}
    </div>

    {#if facts.length}
      <dl class="grid grid-cols-3 gap-x-3 gap-y-2">
        {#each facts as [label, value] (label)}
          <div class="min-w-0">
            <dt class="text-small text-muted-foreground">{label}</dt>
            <dd class="truncate text-sm font-semibold">{value}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if mission.description && !compact}
      <p class="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90" data-no-i18n>{mission.description}</p>
    {/if}

    <div class="mt-auto flex flex-wrap gap-2 pt-1">
      <Button size="sm" onclick={copy}><CopyIcon class="size-4" />复制开房链接</Button>
      <Button size="sm" variant="outline" href={missionFile(mission.id)} download="{mission.id}.blk"><DownloadIcon class="size-4" />下载 .blk</Button>
    </div>
  </div>
</article>
