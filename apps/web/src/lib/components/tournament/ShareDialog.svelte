<script>
  // "分享到 Discord": a ready-to-paste post about the event (time as Discord
  // dynamic timestamps, format, mode and type, check-in, points, vehicle
  // pool; or the podium once finished), editable, split into messages under
  // Discord's 2000-character limit ($lib/discord-share.js). start() opens it.
  import { toast } from "svelte-sonner";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { DISCORD_LIMIT, shareMessage, splitForDiscord } from "$lib/discord-share.js";
  import { formatInZone } from "$lib/datetime.js";
  import { i18n } from "$lib/i18n/locale.svelte.js";
  import CopyIcon from "@lucide/svelte/icons/copy";

  let { tournament, template = null, podium = [] } = $props();

  let open = $state(false);
  let kind = $state("announce");
  let pool = $state("summary");
  let text = $state("");
  let lang = $state("zh");

  function build() {
    text = shareMessage(tournament, {
      kind,
      pool,
      template,
      podium,
      siteUrl: typeof window !== "undefined" ? window.location.origin : "",
      lang,
    });
  }

  export function start() {
    kind = tournament?.status === "completed" ? "results" : "announce";
    lang = i18n.locale === "en" ? "en" : "zh";
    build();
    open = true;
  }

  function choose(k, p, l = lang) {
    kind = k;
    pool = p;
    lang = l;
    build();
  }

  let parts = $derived(splitForDiscord(text));

  // How the timestamps read in this browser (Discord shows each reader their own time).
  let preview = $derived(
    text.replace(/<t:(\d+):([FRtf])>/g, (_, unix, style) => {
      const d = new Date(Number(unix) * 1000);
      if (style === "R") {
        const mins = Math.round((d.getTime() - Date.now()) / 60000);
        if (Math.abs(mins) < 60) return mins >= 0 ? `${mins} 分钟后` : `${-mins} 分钟前`;
        const hours = Math.round(mins / 60);
        if (Math.abs(hours) < 48) return hours >= 0 ? `${hours} 小时后` : `${-hours} 小时前`;
        const days = Math.round(hours / 24);
        return days >= 0 ? `${days} 天后` : `${-days} 天前`;
      }
      const full = formatInZone(d);
      return style === "t" ? full.split(" ").pop() : full;
    }),
  );

  async function copy(part, i) {
    try {
      await navigator.clipboard.writeText(part);
      toast.success(parts.length > 1 ? `已复制第 ${i + 1} 条，粘贴到 Discord 发送` : "已复制，粘贴到 Discord 发送");
    } catch {
      toast.error("复制失败，请手动选中文字复制");
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[640px] max-h-[90vh] flex flex-col gap-3 bg-card border border-border">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="text-base font-bold">分享到 Discord</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        复制后粘贴到 Discord 频道发送。时间使用 Discord 动态时间戳，每个人看到的都是自己时区的时间。
      </Dialog.Description>
    </Dialog.Header>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto -mx-4 px-4">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div class="flex items-center gap-1">
          <span class="text-muted-foreground">内容</span>
          {#each [["announce", "赛事公告"], ["results", "比赛结果"]] as [value, label] (value)}
            <button
              type="button"
              disabled={value === "results" && tournament?.status !== "completed"}
              onclick={() => choose(value, pool)}
              class="rounded-md px-2 py-0.5 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 {kind === value ? 'bg-primary text-primary-foreground' : 'border border-border'}"
            >
              {label}
            </button>
          {/each}
        </div>
        <div class="flex items-center gap-1">
          <span class="text-muted-foreground">语言</span>
          {#each [["zh", "中文"], ["en", "English"]] as [value, label] (value)}
            <button
              type="button"
              onclick={() => choose(kind, pool, value)}
              class="rounded-md px-2 py-0.5 font-semibold cursor-pointer {lang === value ? 'bg-primary text-primary-foreground' : 'border border-border'}"
            >
              {label}
            </button>
          {/each}
        </div>
        {#if kind === "announce"}
          <div class="flex items-center gap-1">
            <span class="text-muted-foreground">载具池</span>
            {#each [["none", "不写"], ["summary", "分组概要"], ["full", "全部载具"]] as [value, label] (value)}
              <button
                type="button"
                disabled={!template && value !== "none"}
                onclick={() => choose(kind, value)}
                class="rounded-md px-2 py-0.5 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 {pool === value ? 'bg-primary text-primary-foreground' : 'border border-border'}"
              >
                {label}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>文字（可以直接修改）</span>
          <span class={text.length > DISCORD_LIMIT ? "text-amber-500 font-semibold" : ""}>
            {text.length} 字{text.length > DISCORD_LIMIT ? ` · 超过 Discord 单条 ${DISCORD_LIMIT} 字，已分成 ${parts.length} 条` : ""}
          </span>
        </div>
        <textarea bind:value={text} rows="12" class="w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed"></textarea>
      </div>

      <div class="space-y-1">
        <div class="text-[11px] text-muted-foreground">时间预览（按你的时区）</div>
        <pre class="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] leading-relaxed">{preview}</pre>
      </div>
    </div>

    <Dialog.Footer class="shrink-0 flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onclick={() => (open = false)} class="text-xs">关闭</Button>
      {#each parts as part, i (i)}
        <Button size="sm" onclick={() => copy(part, i)} class="gap-1.5 text-xs font-bold">
          <CopyIcon class="w-3.5 h-3.5" />
          {parts.length > 1 ? `复制第 ${i + 1} 条` : "复制"}
        </Button>
      {/each}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
