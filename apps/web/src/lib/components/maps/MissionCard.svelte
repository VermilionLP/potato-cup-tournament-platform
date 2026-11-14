<script>
  // One 比赛地图 on /maps and in an event's 说明 tab: name, modes, the main
  // settings, and the link to paste into 自定义战斗 → Missions by URL.
  import { toast } from "svelte-sonner";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Tag } from "#lib/components/ui/tag/index.js";
  import { copyText, missionFacts, missionFile, missionLink, modeLabels } from "#lib/missions.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import MapIcon from "@lucide/svelte/icons/map";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";

  let { mission, compact = false } = $props();

  const summary = $derived(mission.summary);
  const modes = $derived(modeLabels(summary));
  const facts = $derived(missionFacts(summary));

  async function copy() {
    if (await copyText(missionLink(mission.id))) toast.success("已复制开房链接：自定义战斗 → 创建房间 → Missions by URL → 粘贴");
    else toast.error("复制失败，请手动复制链接");
  }
</script>

<article class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 {mission.hidden ? 'opacity-70' : ''}">
  <div class="flex items-start gap-3">
    <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><MapIcon class="size-5" /></span>
    <div class="min-w-0 flex-1">
      <a href="/maps/{mission.id}" class="group flex items-center gap-1 text-base font-bold leading-snug hover:text-brand-ink">
        <span class="min-w-0 truncate" data-no-i18n>{mission.name}</span>
        <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </a>
      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        {#each modes as m (m)}<Tag tone="info">{m}</Tag>{/each}
        {#if mission.hidden}<Tag><EyeOffIcon class="size-3" />已隐藏</Tag>{/if}
        {#if !summary}<Tag tone="live">文件读不出来</Tag>{/if}
        <span class="text-small text-muted-foreground num">v{mission.version}</span>
      </div>
    </div>
  </div>

  {#if facts.length}
    <dl class="grid grid-cols-3 gap-x-3 gap-y-2">
      {#each facts as [label, value] (label)}
        <div class="min-w-0">
          <dt class="text-small text-muted-foreground">{label}</dt>
          <dd class="truncate text-sm font-semibold" data-no-i18n={label === "场景" || label === "时段" || label === "天气"}>{value}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  {#if mission.description && !compact}
    <p class="whitespace-pre-line text-sm leading-relaxed text-foreground/90" data-no-i18n>{mission.description}</p>
  {/if}
  {#if mission.credit}
    <p class="text-small text-muted-foreground">作者 / 出处：<span data-no-i18n>{mission.credit}</span></p>
  {/if}

  <div class="mt-auto flex flex-wrap gap-2">
    <Button size="sm" onclick={copy}><CopyIcon class="size-4" />复制开房链接</Button>
    <Button size="sm" variant="outline" href={missionFile(mission.id)} download="{mission.id}.blk"><DownloadIcon class="size-4" />下载 .blk</Button>
  </div>
</article>
