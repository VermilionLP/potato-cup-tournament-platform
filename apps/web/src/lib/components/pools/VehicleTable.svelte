<script>
  // A template's vehicles: search, and for admins inline editing and
  // removing rows; the import format below.
  import { Input } from "$lib/components/ui/input/index.js";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let { rows = [], isAdmin = false, query = $bindable(""), onedit, onremove } = $props();

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

<div class="relative">
  <SearchIcon class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
  <Input bind:value={query} placeholder="搜索载具、国家、类型或分组..." class="h-8 pl-8 text-xs" />
</div>

<div class="overflow-x-auto rounded-lg border border-border/60">
  <table class="w-full min-w-[640px] text-xs">
    <thead class="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
      <tr>
        <th class="w-8 px-2 py-2 text-right font-semibold">#</th>
        <th class="px-2 py-2 text-left font-semibold">载具名称</th>
        <th class="w-28 px-2 py-2 text-left font-semibold">国家</th>
        <th class="w-16 px-2 py-2 text-left font-semibold">BR</th>
        <th class="w-24 px-2 py-2 text-left font-semibold">类型</th>
        <th class="w-36 px-2 py-2 text-left font-semibold" title="Ban / Pick 按分组禁用和抽取">分组</th>
        {#if isAdmin}<th class="w-8 px-1 py-2"></th>{/if}
      </tr>
    </thead>
    <tbody class="divide-y divide-border/50">
      {#each shownRows as { v, i } (i)}
        <tr class="hover:bg-muted/20">
          <td class="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">{i + 1}</td>
          {#if isAdmin}
            <td class="px-1 py-0.5"><input aria-label="载具名称" class="{cellInput} font-semibold" value={v.name} oninput={(e) => onedit(i, "name", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5"><input aria-label="国家" class={cellInput} value={v.nation} oninput={(e) => onedit(i, "nation", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5"><input aria-label="BR" inputmode="decimal" class="{cellInput} font-mono" value={v.br ?? ""} oninput={(e) => onedit(i, "br", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5"><input aria-label="类型" class={cellInput} value={v.type} oninput={(e) => onedit(i, "type", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5"><input aria-label="分组" class={cellInput} value={v.group} placeholder={v.name} oninput={(e) => onedit(i, "group", e.currentTarget.value)} /></td>
            <td class="px-1 py-0.5 text-center">
              <button type="button" onclick={() => onremove(i)} class="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 cursor-pointer" title="删除这一行" aria-label="删除 {v.name}">
                <Trash2Icon class="h-3.5 w-3.5" />
              </button>
            </td>
          {:else}
            <td class="px-2 py-1.5 font-semibold text-foreground">{v.name}</td>
            <td class="px-2 py-1.5 text-muted-foreground">{v.nation}</td>
            <td class="px-2 py-1.5 font-mono text-muted-foreground">{v.br ?? ""}</td>
            <td class="px-2 py-1.5 text-muted-foreground">{v.type}</td>
            <td class="px-2 py-1.5 text-muted-foreground">{v.group}</td>
          {/if}
        </tr>
      {:else}
        <tr>
          <td colspan={isAdmin ? 7 : 6} class="py-8 text-center text-muted-foreground">
            {query ? "没有匹配的载具" : "载具池是空的"}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="text-[10px] text-muted-foreground">
  导入格式：JSON 数组 <code class="font-mono">[{"{"}"name", "nation", "br", "type", "group"{"}"}]</code>，或第一行为列名
  <code class="font-mono">name,nation,br,type,group</code> 的 CSV；只有 name 必填，分组留空时等于载具名称。导入只替换载具表，模板设置不变。
</p>
