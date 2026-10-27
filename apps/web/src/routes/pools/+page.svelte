<script>
  // Vehicle pools used by Ban / Pick, one per event type. Everyone can view
  // and export them; admins edit, import, save or reset them.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { defaultVehiclePools } from "$lib/data/vehiclePools.js";
  import { groupVehicles } from "$lib/banpick.js";
  import {
    mergePools,
    parsePoolFile,
    poolToCsv,
    poolToJson,
    vehicleListProblem,
  } from "$lib/vehicle-pools.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import CheckIcon from "@lucide/svelte/icons/check";
  import XIcon from "@lucide/svelte/icons/x";
  import SearchIcon from "@lucide/svelte/icons/search";

  let isAdmin = $derived(!!userState.adminToken);
  let pools = $state(mergePools({}, defaultVehiclePools));
  let loading = $state(true);
  let activeId = $state("prop");
  // Unsaved edits per pool: id -> vehicle list.
  let drafts = $state({});
  let saving = $state(false);
  let confirmReset = $state(false);
  let query = $state("");
  let fileInput = $state(null);

  let active = $derived(pools.find((p) => p.id === activeId) || pools[0]);
  let rows = $derived(drafts[activeId] ?? active.vehicles);
  let dirty = $derived(Boolean(drafts[activeId]));
  let problem = $derived(dirty ? vehicleListProblem(rows) : "");
  let groupCount = $derived(groupVehicles(rows.filter((v) => String(v.name ?? "").trim())).length);
  let shownRows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const indexed = rows.map((v, i) => ({ v, i }));
    if (!q) return indexed;
    return indexed.filter(({ v }) =>
      ["name", "nation", "type", "group"].some((f) => String(v[f] ?? "").toLowerCase().includes(q)),
    );
  });

  async function load() {
    try {
      const res = await API.getVehiclePools();
      pools = mergePools(res.pools, defaultVehiclePools);
    } catch (e) {
      toast.error("加载载具池失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
    const warn = (e) => {
      if (Object.keys(drafts).length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });

  function pick(id) {
    activeId = id;
    confirmReset = false;
    query = "";
  }

  function edit(index, field, value) {
    const list = rows.map((v) => ({ ...v }));
    list[index] = { ...list[index], [field]: value };
    drafts[activeId] = list;
  }

  function addRow() {
    drafts[activeId] = [...rows.map((v) => ({ ...v })), { name: "", nation: "", br: "", type: "", group: "" }];
    query = "";
  }

  function removeRow(index) {
    drafts[activeId] = rows.filter((_, i) => i !== index);
  }

  function discard() {
    delete drafts[activeId];
    drafts = { ...drafts };
  }

  async function save() {
    if (problem) return toast.error(problem);
    saving = true;
    try {
      const vehicles = rows.map((v) => ({
        ...v,
        br: v.br === "" || v.br === null || v.br === undefined ? null : Number(v.br),
      }));
      await API.saveVehiclePool(activeId, vehicles);
      discard();
      await load();
      toast.success(`${active.name}载具池已保存`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }

  async function resetToDefault() {
    saving = true;
    try {
      await API.resetVehiclePool(activeId);
      discard();
      confirmReset = false;
      await load();
      toast.success(`${active.name}载具池已恢复默认`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }

  function download(kind) {
    const body = kind === "csv" ? poolToCsv(rows) : poolToJson(rows);
    const blob = new Blob([kind === "csv" ? "﻿" + body : body], {
      type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicle-pool-${activeId}.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importFile(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const vehicles = parsePoolFile(await file.text(), file.name);
      drafts[activeId] = vehicles;
      query = "";
      toast.success(`已导入 ${vehicles.length} 辆载具，检查后点击「保存」生效`);
    } catch (e) {
      toast.error("导入失败: " + e.message);
    }
  }

  const cellInput =
    "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-xs text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none";
</script>

<div class="mx-auto max-w-5xl space-y-4 px-4 py-6">
  <div class="space-y-1">
    <h1 class="flex items-center gap-2 text-xl font-bold text-foreground">
      <PlaneIcon class="h-5 w-5 text-primary" />
      载具池
    </h1>
    <p class="text-xs text-muted-foreground">
      每种比赛类型一个载具池，开启 Ban / Pick 的比赛按比赛类型使用对应的载具池。{isAdmin
        ? "可以直接编辑表格，或导入 JSON / CSV 文件，保存后对所有比赛生效。"
        : "可以导出为 JSON / CSV。"}
    </p>
  </div>

  <!-- One tab per event type -->
  <div class="flex flex-wrap items-center gap-1.5">
    {#each pools as pool (pool.id)}
      <button
        type="button"
        onclick={() => pick(pool.id)}
        aria-pressed={activeId === pool.id}
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer
          {activeId === pool.id
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'}"
      >
        {pool.name}
        <span class="text-[10px] font-normal opacity-75 tabular-nums">{(drafts[pool.id] ?? pool.vehicles).length}</span>
        {#if drafts[pool.id]}
          <span class="h-1.5 w-1.5 rounded-full bg-amber-400" title="有未保存的修改"></span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="space-y-3 rounded-xl border border-border bg-card/40 p-3 sm:p-4">
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-0 flex-1 text-xs text-muted-foreground">
        <span class="font-semibold text-foreground">{rows.length}</span> 辆载具 ·
        <span class="font-semibold text-foreground">{groupCount}</span> 个分组 ·
        {#if dirty}
          <span class="font-semibold text-amber-600 dark:text-amber-400">有未保存的修改</span>
        {:else if active.custom}
          已在网站上修改{active.updated_at ? `（${new Date(active.updated_at).toLocaleString("zh-CN")}）` : ""}
        {:else}
          默认载具池
        {/if}
      </div>
      <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" onclick={() => download("json")}>
        <DownloadIcon class="h-3.5 w-3.5" /> 导出 JSON
      </Button>
      <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" onclick={() => download("csv")}>
        <DownloadIcon class="h-3.5 w-3.5" /> 导出 CSV
      </Button>
      {#if isAdmin}
        <input bind:this={fileInput} type="file" accept=".json,.csv,application/json,text/csv" class="hidden" onchange={importFile} />
        <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" onclick={() => fileInput?.click()}>
          <UploadIcon class="h-3.5 w-3.5" /> 导入
        </Button>
      {/if}
    </div>

    {#if isAdmin}
      <div class="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        <Button size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={!dirty || !!problem || saving} onclick={save}>
          <CheckIcon class="h-3.5 w-3.5" /> 保存
        </Button>
        {#if dirty}
          <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={saving} onclick={discard}>
            <XIcon class="h-3.5 w-3.5" /> 放弃修改
          </Button>
        {/if}
        <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" onclick={addRow}>
          <PlusIcon class="h-3.5 w-3.5" /> 添加载具
        </Button>
        {#if active.custom}
          {#if confirmReset}
            <span class="text-xs text-foreground">恢复为默认载具池（{active.defaults.length} 辆）？网站上的修改会被删除。</span>
            <Button variant="destructive" size="sm" class="h-8 text-xs cursor-pointer" disabled={saving} onclick={resetToDefault}>确认恢复</Button>
            <Button variant="outline" size="sm" class="h-8 text-xs cursor-pointer" onclick={() => (confirmReset = false)}>取消</Button>
          {:else}
            <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={saving} onclick={() => (confirmReset = true)}>
              <RefreshCwIcon class="h-3.5 w-3.5" /> 恢复默认
            </Button>
          {/if}
        {/if}
        {#if problem}
          <span class="text-xs text-amber-600 dark:text-amber-400">{problem}</span>
        {/if}
      </div>
    {/if}

    <div class="relative">
      <SearchIcon class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input bind:value={query} placeholder="搜索载具、国家、类型或分组..." class="h-8 pl-8 text-xs" />
    </div>

    {#if loading}
      <p class="py-8 text-center text-xs text-muted-foreground">加载中...</p>
    {:else}
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
                  <td class="px-1 py-0.5"><input aria-label="载具名称" class="{cellInput} font-semibold" value={v.name} oninput={(e) => edit(i, "name", e.currentTarget.value)} /></td>
                  <td class="px-1 py-0.5"><input aria-label="国家" class={cellInput} value={v.nation} oninput={(e) => edit(i, "nation", e.currentTarget.value)} /></td>
                  <td class="px-1 py-0.5"><input aria-label="BR" inputmode="decimal" class="{cellInput} font-mono" value={v.br ?? ""} oninput={(e) => edit(i, "br", e.currentTarget.value)} /></td>
                  <td class="px-1 py-0.5"><input aria-label="类型" class={cellInput} value={v.type} oninput={(e) => edit(i, "type", e.currentTarget.value)} /></td>
                  <td class="px-1 py-0.5"><input aria-label="分组" class={cellInput} value={v.group} placeholder={v.name} oninput={(e) => edit(i, "group", e.currentTarget.value)} /></td>
                  <td class="px-1 py-0.5 text-center">
                    <button type="button" onclick={() => removeRow(i)} class="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 cursor-pointer" title="删除这一行" aria-label="删除 {v.name}">
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
        <code class="font-mono">name,nation,br,type,group</code> 的 CSV；只有 name 必填，分组留空时等于载具名称。
      </p>
    {/if}
  </div>
</div>
