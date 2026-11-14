<script>
  // Admins add a 比赛地图: a .blk file (as the mission editor saves it) or a
  // link the server downloads it from (e.g. missions.thearena.dev). Name and
  // ID come from the file unless given; the ID is the link's file name.
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { API } from "#lib/api.js";
  import { missionProblems, missionSummary } from "@potato-cup/shared/mission-blk.js";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import LinkIcon from "@lucide/svelte/icons/link";

  let { open = $bindable(false) } = $props();

  let source = $state("file"); // file | link
  let content = $state("");
  let fileName = $state("");
  let link = $state("");
  let name = $state("");
  let id = $state("");
  let credit = $state("");
  let description = $state("");
  let saving = $state(false);

  const problems = $derived(content ? missionProblems(content) : []);
  const summary = $derived(content && !problems.length ? missionSummary(content) : null);
  const ready = $derived(source === "file" ? Boolean(content) && !problems.length : /^https?:\/\/\S+$/.test(link.trim()));

  async function pickFile(e) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    fileName = f.name;
    content = await f.text();
    if (!id) id = f.name.replace(/\.blk$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  async function save() {
    saving = true;
    try {
      const body = { name: name.trim(), id: id.trim(), credit: credit.trim(), description: description.trim() };
      if (source === "file") body.content = content;
      else body.source_url = link.trim();
      const { mission } = await API.createMission(body);
      toast.success(`已添加「${mission.name}」`);
      open = false;
      goto(`/maps/${mission.id}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>添加比赛地图</Dialog.Title>
      <Dialog.Description>上传任务编辑器保存的 .blk 文件，或者填写地图文件的链接由服务器下载。</Dialog.Description>
    </Dialog.Header>

    <div class="flex gap-1 rounded-lg bg-muted p-1">
      <button type="button" onclick={() => (source = "file")} class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-semibold {source === 'file' ? 'bg-card shadow-sm' : 'text-muted-foreground'}"><UploadIcon class="size-4" />上传文件</button>
      <button type="button" onclick={() => (source = "link")} class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-semibold {source === 'link' ? 'bg-card shadow-sm' : 'text-muted-foreground'}"><LinkIcon class="size-4" />从链接导入</button>
    </div>

    {#if source === "file"}
      <label class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-5 text-center hover:bg-muted/40">
        <UploadIcon class="size-5 text-muted-foreground" />
        <span class="text-sm font-semibold">{fileName || "选择 .blk 文件"}</span>
        {#if summary}
          <span class="text-small text-muted-foreground" data-no-i18n>{summary.fields.locName || summary.name}</span>
        {/if}
        <input type="file" accept=".blk,text/plain" class="sr-only" onchange={pickFile} />
      </label>
      {#if problems.length}<p class="text-small font-semibold text-loss">{problems[0]}</p>{/if}
    {:else}
      <div class="space-y-1">
        <label class="text-small font-semibold text-muted-foreground" for="mission-link">地图文件链接</label>
        <input id="mission-link" class="field w-full" bind:value={link} placeholder="https://missions.thearena.dev/m/…" spellcheck="false" />
        <p class="text-small text-muted-foreground">打开后直接是地图文件内容的链接。</p>
      </div>
    {/if}

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-1">
        <label class="text-small font-semibold text-muted-foreground" for="mission-name">名称</label>
        <input id="mission-name" class="field w-full" bind:value={name} placeholder="默认用文件里的名称" />
      </div>
      <div class="space-y-1">
        <label class="text-small font-semibold text-muted-foreground" for="mission-id">链接名（ID）</label>
        <input id="mission-id" class="field w-full" bind:value={id} placeholder="joust-desert" spellcheck="false" />
      </div>
    </div>
    <p class="-mt-2 text-small text-muted-foreground">链接名会出现在开房链接里，只能用小写英文字母、数字和横线，之后不能改。</p>
    <div class="space-y-1">
      <label class="text-small font-semibold text-muted-foreground" for="mission-credit">作者 / 出处</label>
      <input id="mission-credit" class="field w-full" bind:value={credit} placeholder="例如 Demonuk / TheArena" />
    </div>
    <div class="space-y-1">
      <label class="text-small font-semibold text-muted-foreground" for="mission-desc">说明</label>
      <textarea id="mission-desc" class="field min-h-16 w-full py-1.5" bind:value={description} placeholder="规则、适用的比赛等"></textarea>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>取消</Button>
      <Button onclick={save} disabled={!ready || saving}>{saving ? "正在添加…" : "添加"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
