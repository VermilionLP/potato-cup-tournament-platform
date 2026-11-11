<script>
  // A player's season recap image (#lib/season-recap-image.js from GET
  // /players/:id/season-recap), drawn when the dialog opens, to save or copy.
  import { toast } from "svelte-sonner";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { API } from "#lib/api.js";
  import { drawSeasonRecap } from "#lib/season-recap-image.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import DownloadIcon from "@lucide/svelte/icons/download";

  let { playerId, season = "", open = $bindable(false) } = $props();

  let imageUrl = $state("");
  let failed = $state(false);
  let empty = $state(false);
  let blob = null;

  async function make() {
    imageUrl = "";
    failed = empty = false;
    try {
      const recap = await API.getSeasonRecap(playerId, season);
      if (!recap.events) {
        empty = true;
        return;
      }
      const canvas = document.createElement("canvas");
      await drawSeasonRecap(canvas, recap);
      blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      imageUrl = blob ? URL.createObjectURL(blob) : "";
      if (!blob) failed = true;
    } catch (e) {
      console.warn("season recap failed", e);
      failed = true;
    }
  }

  $effect(() => {
    if (open) make();
  });

  function save() {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `${playerId}-${season}-recap.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function copy() {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      toast.success("已复制图片，可以直接粘贴到 QQ / Discord");
    } catch {
      toast.error("这个浏览器不能复制图片，请用「保存图片」");
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[520px] max-h-[90vh] flex flex-col gap-3 bg-card border border-border">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="text-base font-bold">{season} 赛季回顾</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">这个赛季的参赛、战绩、冠军和最常交手的对手，生成一张 1080 × 1350 的图片。</Dialog.Description>
    </Dialog.Header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if imageUrl}
        <img src={imageUrl} alt="{season} 赛季回顾" class="mx-auto max-h-[60vh] rounded-md border border-border" />
      {:else if empty}
        <p class="py-10 text-center text-sm text-muted-foreground">{season} 赛季还没有参赛记录</p>
      {:else if failed}
        <p class="py-10 text-center text-sm text-destructive">生成失败，请稍后再试</p>
      {:else}
        <p class="py-10 text-center text-sm text-muted-foreground">正在生成…</p>
      {/if}
    </div>
    <Dialog.Footer class="shrink-0 flex flex-wrap gap-2">
      <Button variant="outline" disabled={!imageUrl} onclick={copy} class="gap-1.5"><CopyIcon class="h-4 w-4" />复制图片</Button>
      <Button disabled={!imageUrl} onclick={save} class="gap-1.5"><DownloadIcon class="h-4 w-4" />保存图片</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
