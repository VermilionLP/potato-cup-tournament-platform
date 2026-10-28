<script>
  // Liquipedia page for the event (made by the API from the event's format,
  // results and points table) plus the export settings the event cannot
  // tell: page names, tier, prize money, qualification, broadcast talent,
  // streams. Settings are saved per event; a new event starts from the last
  // one's talent and streams. Open with start().
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { copyText } from "$lib/clipboard.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  let { tid } = $props();

  let open = $state(false);
  let tab = $state("code"); // code | settings
  let loading = $state(false);
  let saving = $state(false);
  let text = $state("");
  let warnings = $state([]);
  let saved = $state(false);
  let draft = $state(null);

  const POSITIONS = ["Host", "Commentator", "Caster", "Observer", "Producer", "Analyst"];
  const BEST_OF = [1, 3, 5, 7, 9];

  // Talent people are edited as "name, flag" lines.
  function toDraft(meta) {
    return {
      ...structuredClone(meta),
      talents: meta.talents.map((g) => ({
        position: g.position,
        lang: g.lang,
        peopleText: g.people.map((p) => (p.flag ? `${p.name}, ${p.flag}` : p.name)).join("\n"),
      })),
    };
  }

  function fromDraft(d) {
    return {
      ...d,
      talents: d.talents.map((g) => ({
        position: g.position,
        lang: g.lang,
        people: g.peopleText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const m = /^(.*?)[,，]\s*([a-zA-Z]{2,20})$/.exec(line);
            return m ? { name: m[1].trim(), flag: m[2] } : { name: line, flag: "" };
          }),
      })),
    };
  }

  function apply(res) {
    text = res.wikiScript || "";
    warnings = res.warnings || [];
    saved = Boolean(res.saved);
    draft = toDraft(res.meta);
  }

  export async function start() {
    open = true;
    tab = "code";
    loading = true;
    try {
      apply(await API.getWikiScript(tid));
    } catch (e) {
      toast.error("生成 Wiki 代码失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    try {
      apply(await API.saveWikiSettings(tid, fromDraft($state.snapshot(draft))));
      tab = "code";
      toast.success("导出设置已保存，Wiki 代码已重新生成");
    } catch (e) {
      toast.error("保存失败: " + e.message);
    } finally {
      saving = false;
    }
  }

  async function copy() {
    if (!text) return;
    const ok = await copyText(text);
    if (ok) toast.success("Wiki 代码已复制到剪贴板");
    else toast.error("复制失败，请手动选中后复制");
  }

  const field = "h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none";
  const area = "w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] text-foreground focus:border-primary focus:outline-none";
  const label = "text-[11px] font-semibold text-muted-foreground";
</script>

{#snippet boSelect(key, title)}
  <label class="space-y-1">
    <span class={label}>{title}</span>
    <select class="{field} cursor-pointer" value={draft.bestOf[key] ?? ""} onchange={(e) => (draft.bestOf[key] = e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
      <option value="">自动（按比分推算）</option>
      {#each BEST_OF as n (n)}<option value={n}>Bo{n}</option>{/each}
    </select>
  </label>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-3xl max-h-[90vh] flex flex-col gap-3 bg-card border border-border">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="text-lg font-bold text-foreground flex items-center gap-2">
        <FileTextIcon class="w-5 h-5 text-primary" />
        Liquipedia Wiki 代码导出
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        赛制、对阵、比分和积分来自赛事本身；奖金、解说、直播等在「导出设置」里按赛事填写。{saved ? "" : "这场还没保存过设置，解说和直播沿用上一场。"}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex shrink-0 gap-1.5">
      {#each [{ id: "code", label: "Wiki 代码" }, { id: "settings", label: "导出设置" }] as t (t.id)}
        <button
          type="button"
          onclick={() => (tab = t.id)}
          disabled={loading}
          class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50
            {tab === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}"
        >
          {t.label}
        </button>
      {/each}
    </div>

    {#if loading}
      <div class="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-xs">
        <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span>正在生成代码...</span>
      </div>
    {:else if tab === "code"}
      <div class="min-h-0 flex-1 flex flex-col gap-3">
        {#each warnings as w (w)}
          <p class="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
          </p>
        {/each}
        <textarea readonly value={text} class="{area} min-h-72 flex-1 resize-none"></textarea>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={() => (open = false)} class="flex-1 text-xs h-9 cursor-pointer">关闭</Button>
          <Button size="sm" onclick={copy} disabled={!text} class="flex-1 text-xs font-semibold h-9 cursor-pointer gap-1.5">
            <CopyIcon class="w-3.5 h-3.5" /> 复制 Wiki 代码
          </Button>
        </div>
      </div>
    {:else if draft}
      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain -mx-4 px-4 pb-1 text-xs">
        <section class="space-y-2">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">页面</h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <label class="space-y-1"><span class={label}>页面名称（留空：周赛用 Potato Cup Weekly #编号，其他用赛事名）</span><input class={field} bind:value={draft.name} /></label>
            <label class="space-y-1"><span class={label}>简称 tickername（留空同名称）</span><input class={field} bind:value={draft.tickername} placeholder="PC 2026 Aug - AS" /></label>
            <label class="space-y-1">
              <span class={label}>Liquipedia 等级</span>
              <select class="{field} cursor-pointer" bind:value={draft.tier}>
                <option value="">自动（周赛 4，其他 3）</option>
                {#each ["1", "2", "3", "4", "5"] as n (n)}<option value={n}>Tier {n}</option>{/each}
              </select>
            </label>
            <label class="space-y-1"><span class={label}>等级类型（留空：周赛 Weekly）</span><input class={field} bind:value={draft.tiertype} /></label>
            <label class="space-y-1"><span class={label}>服务器</span><input class={field} bind:value={draft.server} placeholder="Europe" /></label>
            <label class="space-y-1"><span class={label}>结束日期（两天赛事填，淘汰赛按这天）</span><input type="date" class={field} bind:value={draft.endDate} /></label>
            <label class="space-y-1"><span class={label}>赛事网址 web</span><input class={field} bind:value={draft.web} /></label>
            <label class="space-y-1"><span class={label}>对阵链接 bracket（留空：本站赛事页）</span><input class={field} bind:value={draft.bracketUrl} /></label>
            <label class="space-y-1"><span class={label}>上一届（页面|显示名）</span><input class={field} bind:value={draft.previous} placeholder={"Potato Cup Weekly/11{{!}}#11"} /></label>
            <label class="space-y-1"><span class={label}>下一届</span><input class={field} bind:value={draft.next} /></label>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">赛制</h3>
          <div class="grid gap-2 sm:grid-cols-3">
            {@render boSelect("group", "小组赛 / 瑞士轮")}
            {@render boSelect("playoff", "淘汰赛")}
            {@render boSelect("final", "总决赛")}
          </div>
          <label class="block space-y-1">
            <span class={label}>补充说明（每行一条，加在 Format 下）</span>
            <textarea class="{area} h-16" bind:value={draft.notes}></textarea>
          </label>
        </section>

        <section class="space-y-2">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">奖金</h3>
          <p class="text-[11px] text-muted-foreground">积分自动取赛事的积分表，这里只填奖金和实物奖励；名次写法 1、2、3-4。</p>
          <div class="grid gap-2 sm:grid-cols-3">
            <label class="space-y-1"><span class={label}>总奖金</span><input class={field} inputmode="decimal" bind:value={draft.prizepool} /></label>
            <label class="space-y-1">
              <span class={label}>总奖金货币</span>
              <select class="{field} cursor-pointer" bind:value={draft.currency}>
                <option value="cny">人民币（prizepool）</option>
                <option value="usd">美元（prizepoolusd）</option>
              </select>
            </label>
            <label class="space-y-1"><span class={label}>额外奖励名称</span><input class={field} bind:value={draft.freetextName} placeholder="Golden Eagle" /></label>
          </div>
          <div class="space-y-1.5">
            <div class="grid grid-cols-[5rem_1fr_1fr_2rem] gap-2 {label}"><span>名次</span><span>奖金（CNY）</span><span>额外奖励</span><span></span></div>
            {#each draft.prizes as p, i (i)}
              <div class="grid grid-cols-[5rem_1fr_1fr_2rem] gap-2">
                <input class={field} bind:value={p.place} placeholder="1" />
                <input class={field} inputmode="decimal" bind:value={p.localprize} />
                <input class={field} bind:value={p.freetext} />
                <button type="button" onclick={() => draft.prizes.splice(i, 1)} class="flex items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 cursor-pointer" aria-label="删除这一行">
                  <Trash2Icon class="h-3.5 w-3.5" />
                </button>
              </div>
            {/each}
            <Button variant="outline" size="sm" class="h-7 gap-1 text-[11px] cursor-pointer" onclick={() => draft.prizes.push({ place: "", localprize: "", freetext: "" })}>
              <PlusIcon class="h-3.5 w-3.5" /> 添加名次
            </Button>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <label class="space-y-1"><span class={label}>直通资格（显示名）</span><input class={field} bind:value={draft.qualifies.name} placeholder="Winter Cup Prop" /></label>
            <label class="space-y-1"><span class={label}>直通赛事页面</span><input class={field} bind:value={draft.qualifies.link} placeholder="Potato_Cup/2026/Winter/Prop" /></label>
            <label class="space-y-1"><span class={label}>获得资格的名次</span><input class={field} bind:value={draft.qualifies.places} placeholder="1" /></label>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">解说与直播</h3>
          {#each draft.talents as g, i (i)}
            <div class="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[9rem_8rem_1fr_2rem]">
              <select class="{field} cursor-pointer" bind:value={g.position}>
                {#each POSITIONS as pos (pos)}<option value={pos}>{pos}</option>{/each}
              </select>
              <input class={field} bind:value={g.lang} placeholder="Chinese" aria-label="语言" />
              <textarea class="{area} h-20" bind:value={g.peopleText} placeholder={"每行一人，可加国旗：\nZero8apple, cn"} aria-label="人员"></textarea>
              <button type="button" onclick={() => draft.talents.splice(i, 1)} class="flex h-8 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 cursor-pointer" aria-label="删除这一组">
                <Trash2Icon class="h-3.5 w-3.5" />
              </button>
            </div>
          {/each}
          <Button variant="outline" size="sm" class="h-7 gap-1 text-[11px] cursor-pointer" onclick={() => draft.talents.push({ position: "Commentator", lang: "", peopleText: "" })}>
            <PlusIcon class="h-3.5 w-3.5" /> 添加一组
          </Button>
          <label class="block space-y-1">
            <span class={label}>直播 Streams 参数（原样写入 {"{{Streams}}"}）</span>
            <textarea class="{area} h-16" bind:value={draft.streams}></textarea>
          </label>
          <label class="block space-y-1">
            <span class={label}>录像 VODs（每行一条，可留空）</span>
            <textarea class="{area} h-12" bind:value={draft.vods} placeholder="[https://space.bilibili.com/... VODs on Bilibili]"></textarea>
          </label>
        </section>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onclick={() => (tab = "code")} class="flex-1 text-xs h-9 cursor-pointer">返回代码</Button>
        <Button size="sm" onclick={save} disabled={saving} class="flex-1 text-xs font-semibold h-9 cursor-pointer">
          {saving ? "保存中..." : "保存并重新生成"}
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
