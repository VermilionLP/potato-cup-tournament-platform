<script>
  // A template's vehicles (filtered by the page's search), with each
  // nation's flag and the group as a pill; admins edit rows inline and
  // remove them. The import format is in a fold below. The Wiki ID column shows the
  // War Thunder unit id the picture comes from: typed in, or matched by
  // name (#lib/wt-units.js, shown greyed).
  import { onMount } from "svelte";
  import { loadUnitIndex, nationFlag, unitIdOf, wikiPage } from "#lib/wt-units.js";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let { rows = [], isAdmin = false, query = "", onedit, onremove } = $props();

  let unitIndex = $state(null);
  onMount(() => {
    loadUnitIndex().then((index) => (unitIndex = index));
  });
  const autoId = (v) => (unitIndex ? unitIdOf({ ...v, wiki: "" }, unitIndex) : null);

  let shownRows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const indexed = rows.map((v, i) => ({ v, i }));
    if (!q) return indexed;
    return indexed.filter(({ v }) =>
      ["name", "nation", "type", "group"].some((f) => String(v[f] ?? "").toLowerCase().includes(q)),
    );
  });
  const cellInput =
    "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-xs text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none";
</script>

{#snippet flag(nation)}
  {@const f = nationFlag(nation)}
  {#if f}<img src={f.cached} alt="" class="h-3.5 w-auto shrink-0 rounded-[2px]" loading="lazy" onerror={(e) => (e.currentTarget.style.display = "none")} />{/if}
{/snippet}

<div class="overflow-x-auto rounded-lg border border-border/60 bg-background/60">
  <table class="w-full min-w-[780px] text-xs">
    <thead class="border-b border-border/60 bg-muted/50 text-label uppercase tracking-wider text-muted-foreground">
      <tr>
        <th class="w-8 px-2 py-2 text-right font-semibold">#</th>
        <th class="w-[24%] px-2 py-2 text-left font-semibold">载具名称</th>
        <th class="w-32 px-2 py-2 text-left font-semibold">国家</th>
        <th class="w-16 px-2 py-2 text-right font-semibold">BR</th>
        <th class="w-24 px-2 py-2 text-left font-semibold">类型</th>
        <th class="w-36 px-2 py-2 text-left font-semibold" title="Ban / Pick 按分组禁用和抽取">分组</th>
        <th class="w-36 px-2 py-2 text-left font-semibold" title="War Thunder Wiki 的单位 ID，用来显示载具图片；留空时按名称自动匹配（灰字）">Wiki ID</th>
        {#if isAdmin}<th class="w-8 px-1 py-2"></th>{/if}
      </tr>
    </thead>
    <tbody class="divide-y divide-border/50">
      {#each shownRows as { v, i } (i)}
        <tr class="hover:bg-muted/20">
          <td class="px-2 py-1 text-right num text-small text-muted-foreground/70">{i + 1}</td>
          {#if isAdmin}
            <td class="px-1 py-0.5"><input aria-label="载具名称" class="{cellInput} font-semibold" value={v.name} oninput={(e) => onedit(i, "name", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5">
              <span class="flex items-center gap-1 pl-1">
                {@render flag(v.nation)}
                <input aria-label="国家" class={cellInput} value={v.nation} oninput={(e) => onedit(i, "nation", e.currentTarget.value)} />
              </span>
            </td>
            <td class="px-1 py-0.5"><input aria-label="BR" inputmode="decimal" class="{cellInput} num text-right" value={v.br ?? ""} oninput={(e) => onedit(i, "br", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5"><input aria-label="类型" class={cellInput} value={v.type} oninput={(e) => onedit(i, "type", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5"><input aria-label="分组" class={cellInput} value={v.group} placeholder={v.name} oninput={(e) => onedit(i, "group", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5">
              <input
                aria-label="Wiki ID"
                class="{cellInput} num {v.wiki || autoId(v) ? '' : 'placeholder:text-amber-500'}"
                value={v.wiki ?? ""}
                placeholder={autoId(v) || (unitIndex ? "未匹配，请填写" : "")}
                oninput={(e) => onedit(i, "wiki", e.currentTarget.value.trim().toLowerCase())}
              />
            </td>
            <td class="px-1 py-0.5 text-center">
              <button type="button" onclick={() => onremove(i)} class="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 cursor-pointer" title="删除这一行" aria-label="删除 {v.name}">
                <Trash2Icon class="h-3.5 w-3.5" />
              </button>
            </td>
          {:else}
            <td class="px-2 py-1.5 font-semibold text-foreground">{v.name}</td>
            <td class="px-2 py-1.5 text-muted-foreground"><span class="flex items-center gap-1.5">{@render flag(v.nation)}{v.nation}</span></td>
            <td class="px-2 py-1.5 text-right num font-semibold">{v.br == null || v.br === "" ? "" : Number(v.br).toFixed(1)}</td>
            <td class="px-2 py-1.5 text-muted-foreground">{v.type}</td>
            <td class="px-2 py-1.5"><span class="rounded-full bg-secondary px-2 py-0.5 text-small font-semibold text-secondary-foreground">{v.group || v.name}</span></td>
            <td class="px-2 py-1.5 num text-small">
              {#if v.wiki || autoId(v)}
                <a href={wikiPage(v.wiki || autoId(v))} target="_blank" rel="noopener" class="{v.wiki ? 'text-brand-ink' : 'text-muted-foreground'} hover:underline">{v.wiki || autoId(v)}</a>
              {/if}
            </td>
          {/if}
        </tr>
      {:else}
        <tr>
          <td colspan={isAdmin ? 8 : 7} class="py-8 text-center text-muted-foreground">
            {query ? "没有匹配的载具" : "载具池是空的"}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<details class="text-small text-muted-foreground">
  <summary class="cursor-pointer select-none font-semibold hover:text-foreground">导入格式说明</summary>
  <p class="pt-1.5 leading-relaxed">导入格式：JSON 数组 <code class="num">[{"{"}"name", "nation", "br", "type", "group", "wiki"{"}"}]</code>，或第一行为列名
  <code class="num">name,nation,br,type,group,wiki</code> 的 CSV；只有 name 必填，分组留空时等于载具名称，wiki（War Thunder Wiki 单位 ID，决定载具图片）留空时按名称自动匹配。导入只替换载具表，模板设置不变。</p>
</details>
