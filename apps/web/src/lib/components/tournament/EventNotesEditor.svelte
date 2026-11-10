<script>
  // Event settings → 补充说明: the organisers' own notes, shown at the top of
  // the 说明 tab (局数、地图、房间设置、违规处理…). Plain text, saved with
  // 保存说明; any time, finished events included.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { Button } from "#lib/components/ui/button/index.js";

  const MAX = 4000; // apps/api/routes/tournament-settings.js MAX_DESCRIPTION

  let { tournament = $bindable(), tid } = $props();
  let draft = $state(tournament?.description || "");
  let saving = $state(false);
  const changed = $derived(draft.trim() !== (tournament?.description || "").trim());

  /** Back to the saved notes (the dialog opens with them). */
  export function reset() {
    draft = tournament?.description || "";
  }

  async function save() {
    saving = true;
    try {
      const res = await API.updateTournament(tid, { description: draft });
      tournament = { ...tournament, description: res.description };
      draft = res.description || "";
      toast.success(draft ? "补充说明已保存，显示在「说明」页最上方" : "已清空补充说明");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-2">
  <textarea
    bind:value={draft}
    maxlength={MAX}
    rows="5"
    placeholder={"例如：\n· 每场 BO3，先赢两局晋级\n· 房间由 A 方创建，地图随机\n· 迟到 15 分钟判负"}
    class="field h-auto min-h-28 w-full resize-y py-2 leading-relaxed"
  ></textarea>
  <div class="flex items-center justify-end gap-2">
    <span class="mr-auto text-small text-muted-foreground num">{draft.length} / {MAX}</span>
    {#if changed}<Button variant="outline" size="sm" onclick={reset} disabled={saving}>撤销</Button>{/if}
    <Button size="sm" onclick={save} disabled={!changed || saving}>保存说明</Button>
  </div>
</div>
