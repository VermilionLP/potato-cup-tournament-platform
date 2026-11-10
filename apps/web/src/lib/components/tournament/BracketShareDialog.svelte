<script>
  // "生成分享图": the whole elimination bracket as one PNG (double
  // elimination: winners band with the grand final, losers band under it),
  // with a preview and download / copy / share. Layout in
  // #lib/bracket-image.js, painting in #lib/bracket-image-draw.js.
  import { toast } from "svelte-sonner";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { bracketImageLayout } from "#lib/bracket-image.js";
  import { drawBracketImage } from "#lib/bracket-image-draw.js";
  import ImageIcon from "@lucide/svelte/icons/image";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import Share2Icon from "@lucide/svelte/icons/share-2";

  let { tournament, matches = [], doubleElim = false, playerName = (id) => id } = $props();

  let open = $state(false);
  let busy = $state(false);
  let blob = $state(null);
  let url = $state("");
  let size = $state({ width: 0, height: 0 });

  const fileName = $derived(`${tournament?.id || "bracket"}-bracket.png`);
  const canCopy = typeof window !== "undefined" && typeof window.ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);
  let canShare = $state(false);

  async function generate() {
    open = true;
    busy = true;
    if (url) URL.revokeObjectURL(url);
    url = "";
    blob = null;
    try {
      const layout = bracketImageLayout({ tournament, matches, doubleElim, playerName });
      size = { width: layout.width, height: layout.height };
      blob = await drawBracketImage(layout);
      url = URL.createObjectURL(blob);
      const file = new File([blob], fileName, { type: "image/png" });
      canShare = Boolean(navigator.canShare?.({ files: [file] }));
    } catch (e) {
      toast.error(`生成图片失败: ${e.message}`);
      open = false;
    } finally {
      busy = false;
    }
  }

  function download() {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copy() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("图片已复制，可以直接粘贴到 QQ / Discord");
    } catch {
      toast.error("这个浏览器不能复制图片，请点「下载图片」");
    }
  }

  async function share() {
    try {
      await navigator.share({ files: [new File([blob], fileName, { type: "image/png" })], title: tournament?.name || "" });
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("分享失败，请点「下载图片」");
    }
  }

  $effect(() => () => url && URL.revokeObjectURL(url));
</script>

<Button variant="outline" size="sm" onclick={generate} disabled={busy || !matches.length} class="h-8 gap-1.5 text-xs font-bold">
  <ImageIcon class="size-4" />生成分享图
</Button>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[760px] max-h-[90vh] flex flex-col gap-3 border border-border bg-card">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold">对阵图分享图</Dialog.Title>
      <Dialog.Description class="text-xs">
        {doubleElim ? "完整对阵（胜者组、总决赛和败者组合并为一张），可以下载或直接复制到 QQ / Discord。" : "完整对阵，可以下载或直接复制到 QQ / Discord。"}
      </Dialog.Description>
    </Dialog.Header>
    <div class="min-h-40 flex-1 overflow-auto rounded-lg border border-border bg-muted/30">
      {#if busy}
        <p class="py-16 text-center text-sm text-muted-foreground">正在生成…</p>
      {:else if url}
        <img src={url} alt="对阵图" class="block w-full" style="min-width: min(100%, {size.width}px)" />
      {/if}
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-small text-muted-foreground num">{size.width * 2} × {size.height * 2} 像素</span>
      <div class="flex flex-wrap gap-2">
        {#if canShare}
          <Button variant="outline" size="sm" disabled={!blob} onclick={share} class="gap-1.5 text-xs"><Share2Icon class="size-4" />分享</Button>
        {/if}
        {#if canCopy}
          <Button variant="outline" size="sm" disabled={!blob} onclick={copy} class="gap-1.5 text-xs"><CopyIcon class="size-4" />复制图片</Button>
        {/if}
        <Button size="sm" disabled={!blob} onclick={download} class="gap-1.5 text-xs font-bold"><DownloadIcon class="size-4" />下载图片</Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
