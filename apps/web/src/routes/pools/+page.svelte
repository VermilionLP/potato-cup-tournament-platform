<script>
  // Vehicle pool templates used by Ban / Pick. Each template belongs to one
  // event type, can be limited to game modes and carries its own Ban / Pick
  // rules. Events use the best-matching template unless an admin picks one.
  // Everyone can view and export them; admins create, copy, edit and delete.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { DEFAULT_BP_RULES, groupVehicles, normalizeRules, rulesSummary } from "$lib/banpick.js";
  import { GAME_MODES, POOL_TAG, VEHICLE_POOLS } from "$lib/tournament.js";
  import { modesLabel, parsePoolFile, poolToCsv, poolToJson, vehicleListProblem } from "$lib/vehicle-pools.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import CheckIcon from "@lucide/svelte/icons/check";
  import XIcon from "@lucide/svelte/icons/x";
  import SearchIcon from "@lucide/svelte/icons/search";

  const NEW_ID = "__new";

  let isAdmin = $derived(!!userState.adminToken);
  let templates = $state([]);
  let loading = $state(true);
  let activeId = $state("");
  // Unsaved edits per template id (NEW_ID = a template not created yet).
  let drafts = $state({});
  let saving = $state(false);
  let confirmDelete = $state(false);
  let query = $state("");
  let fileInput = $state(null);

  const copyOf = (t) => ({
    name: t.name,
    event_type: t.event_type,
    game_modes: [...(t.game_modes || [])],
    rules: { ...normalizeRules(t.rules) },
    sort_order: t.sort_order ?? 100,
    vehicles: (t.vehicles || []).map((v) => ({ ...v })),
  });

  let saved = $derived(templates.find((t) => t.id === activeId) || null);
  let current = $derived(drafts[activeId] ?? saved);
  let dirty = $derived(Boolean(drafts[activeId]));
  let isNew = $derived(activeId === NEW_ID);
  let rows = $derived(current?.vehicles || []);
  let problem = $derived(dirty ? (!String(current.name || "").trim() ? "请填写模板名称" : vehicleListProblem(rows)) : "");
  let groupCount = $derived(groupVehicles(rows.filter((v) => String(v.name ?? "").trim())).length);
  let shownRows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const indexed = rows.map((v, i) => ({ v, i }));
    if (!q) return indexed;
    return indexed.filter(({ v }) =>
      ["name", "nation", "type", "group"].some((f) => String(v[f] ?? "").toLowerCase().includes(q)),
    );
  });
  // Templates by event type, in the order events choose them.
  let byType = $derived(
    VEHICLE_POOLS.map((type) => ({
      ...type,
      templates: templates
        .filter((t) => t.event_type === type.id)
        .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.id).localeCompare(String(b.id))),
    })),
  );

  async function load(selectId) {
    try {
      const res = await API.getVehiclePools();
      templates = res.templates || [];
      const want = selectId || activeId || page.url.searchParams.get("template");
      if (want !== NEW_ID || !drafts[NEW_ID]) {
        activeId = templates.some((t) => t.id === want) ? want : templates[0]?.id || "";
      }
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
    confirmDelete = false;
    query = "";
  }

  // Start editing the active template (copied once, then changed in place).
  function draft() {
    if (!drafts[activeId]) drafts[activeId] = copyOf(saved);
    return drafts[activeId];
  }

  function setField(field, value) {
    draft()[field] = value;
  }

  function setRule(field, value) {
    draft().rules[field] = value;
  }

  function toggleMode(mode) {
    const d = draft();
    d.game_modes = d.game_modes.includes(mode) ? d.game_modes.filter((m) => m !== mode) : [...d.game_modes, mode];
  }

  function editCell(index, field, value) {
    draft().vehicles[index][field] = value;
  }

  function addRow() {
    draft().vehicles.push({ name: "", nation: "", br: "", type: "", group: "" });
    query = "";
  }

  function removeRow(index) {
    draft().vehicles.splice(index, 1);
  }

  function discard() {
    const wasNew = isNew;
    delete drafts[activeId];
    drafts = { ...drafts };
    if (wasNew) activeId = templates[0]?.id || "";
  }

  function startNew(source) {
    drafts[NEW_ID] = source
      ? { ...copyOf(source), name: `${source.name} 副本`.slice(0, 40) }
      : {
          name: "",
          event_type: saved?.event_type || VEHICLE_POOLS[0].id,
          game_modes: [],
          rules: { ...DEFAULT_BP_RULES },
          sort_order: 100,
          vehicles: [{ name: "", nation: "", br: "", type: "", group: "" }],
        };
    pick(NEW_ID);
  }

  async function save() {
    if (problem) return toast.error(problem);
    saving = true;
    try {
      const body = {
        ...current,
        name: current.name.trim(),
        sort_order: Number(current.sort_order) || 0,
        vehicles: rows.map((v) => ({
          ...v,
          br: v.br === "" || v.br === null || v.br === undefined ? null : Number(v.br),
        })),
      };
      const res = isNew ? await API.createVehiclePool(body) : await API.updateVehiclePool(activeId, body);
      delete drafts[activeId];
      drafts = { ...drafts };
      await load(res.id);
      toast.success(`载具池模板「${res.name}」已保存`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    saving = true;
    try {
      const name = saved?.name;
      await API.deleteVehiclePool(activeId);
      delete drafts[activeId];
      drafts = { ...drafts };
      confirmDelete = false;
      activeId = "";
      await load();
      toast.success(`载具池模板「${name}」已删除`);
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
    a.download = `vehicle-pool-${isNew ? "new" : activeId}.${kind}`;
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
      setField("vehicles", vehicles);
      query = "";
      toast.success(`已导入 ${vehicles.length} 辆载具，检查后点击「保存」生效`);
    } catch (e) {
      toast.error("导入失败: " + e.message);
    }
  }

  // Removal limits: "" = unlimited, else 0-20.
  const limitValue = (n) => (n === null || n === undefined ? "" : String(n));
  const parseLimit = (value) => (value === "" ? null : Math.max(0, Math.min(20, Math.round(Number(value)) || 0)));

  const cellInput =
    "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-xs text-foreground hover:border-border focus:border-primary focus:bg-background focus:outline-none";
  const fieldInput = "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-60";
</script>

<div class="mx-auto max-w-5xl space-y-4 px-4 py-6">
  <div class="space-y-1">
    <h1 class="flex items-center gap-2 text-xl font-bold text-foreground">
      <PlaneIcon class="h-5 w-5 text-primary" />
      载具池模板
    </h1>
    <p class="text-xs text-muted-foreground">
      每个模板属于一种比赛类型，可以限定游戏模式，并带有自己的 Ban / Pick 规则。比赛默认自动使用同类型里最匹配游戏模式的模板（按排序），管理员也可以在赛事页手动指定。{isAdmin
        ? "可以新建、复制、编辑和删除模板，或导入 JSON / CSV 载具表。"
        : "可以导出载具表为 JSON / CSV。"}
    </p>
  </div>

  {#if loading}
    <p class="py-8 text-center text-xs text-muted-foreground">加载中...</p>
  {:else}
    <!-- Templates grouped by event type -->
    <div class="space-y-2">
      {#each byType as type (type.id)}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="w-28 shrink-0 rounded-md border px-2 py-0.5 text-center text-xs font-semibold {POOL_TAG[type.id] || 'border-border'}">{type.name}</span>
          {#each type.templates as t (t.id)}
            <button
              type="button"
              onclick={() => pick(t.id)}
              aria-pressed={activeId === t.id}
              class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer
                {activeId === t.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'}"
            >
              {t.name}
              <span class="text-[10px] font-normal opacity-75">{modesLabel(t.game_modes)} · {(drafts[t.id] ?? t).vehicles.length}</span>
              {#if drafts[t.id]}
                <span class="h-1.5 w-1.5 rounded-full bg-amber-400" title="有未保存的修改"></span>
              {/if}
            </button>
          {:else}
            <span class="text-xs text-muted-foreground">没有模板，这类比赛无法 Ban / Pick</span>
          {/each}
        </div>
      {/each}
      {#if isAdmin}
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          {#if drafts[NEW_ID]}
            <button
              type="button"
              onclick={() => pick(NEW_ID)}
              aria-pressed={isNew}
              class="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs font-semibold cursor-pointer {isNew ? 'border-primary text-primary' : 'border-border text-muted-foreground'}"
            >
              {drafts[NEW_ID].name || "新模板"}（未保存）
            </button>
          {:else}
            <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs cursor-pointer" onclick={() => startNew(null)}>
              <PlusIcon class="h-3.5 w-3.5" /> 新建模板
            </Button>
          {/if}
        </div>
      {/if}
    </div>

    {#if current}
      <div class="space-y-3 rounded-xl border border-border bg-card/40 p-3 sm:p-4">
        <!-- Template settings -->
        {#if isAdmin}
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-xs">
              <span class="font-semibold text-foreground">模板名称</span>
              <input class="{fieldInput} w-full" maxlength="40" value={current.name} oninput={(e) => setField("name", e.currentTarget.value)} placeholder="例如：AB 螺旋桨" />
            </label>
            <div class="grid grid-cols-[1fr_6rem] gap-2">
              <label class="space-y-1 text-xs">
                <span class="font-semibold text-foreground">比赛类型</span>
                <select class="{fieldInput} w-full cursor-pointer" value={current.event_type} onchange={(e) => setField("event_type", e.currentTarget.value)}>
                  {#each VEHICLE_POOLS as type (type.id)}
                    <option value={type.id}>{type.name}</option>
                  {/each}
                </select>
              </label>
              <label class="space-y-1 text-xs" title="同类型有多个模板都匹配时，数字小的优先">
                <span class="font-semibold text-foreground">排序</span>
                <input class="{fieldInput} w-full font-mono" type="number" min="0" max="9999" value={current.sort_order} oninput={(e) => setField("sort_order", e.currentTarget.value)} />
              </label>
            </div>
            <div class="space-y-1 text-xs">
              <span class="font-semibold text-foreground">适用游戏模式</span>
              <div class="flex flex-wrap items-center gap-3">
                {#each GAME_MODES as mode (mode.id)}
                  <label class="inline-flex items-center gap-1.5 cursor-pointer" title={mode.name}>
                    <input type="checkbox" class="cursor-pointer" checked={current.game_modes.includes(mode.id)} onchange={() => toggleMode(mode.id)} />
                    <span class="font-mono font-semibold">{mode.code}</span>
                  </label>
                {/each}
                <span class="text-muted-foreground">{current.game_modes.length ? "" : "都不勾选 = 全部模式"}</span>
              </div>
            </div>
            <div class="space-y-1 text-xs">
              <span class="font-semibold text-foreground">Ban / Pick 规则</span>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label class="inline-flex items-center gap-1.5">
                  每人禁
                  <select class="{fieldInput} h-7 cursor-pointer" value={String(current.rules.bansPerPlayer)} onchange={(e) => setRule("bansPerPlayer", Number(e.currentTarget.value))}>
                    {#each [0, 1, 2, 3] as n (n)}<option value={String(n)}>{n}</option>{/each}
                  </select>
                  组
                </label>
                <label class="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" class="cursor-pointer" checked={current.rules.drawVehicle} onchange={(e) => setRule("drawVehicle", e.currentTarget.checked)} />
                  抽完大组再抽具体载具
                </label>
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label class="inline-flex items-center gap-1.5" title="留空 = 不限次数（可随时重抽）">
                  大组可移出
                  <input class="{fieldInput} h-7 w-14 font-mono" type="number" min="0" max="20" placeholder="不限" value={limitValue(current.rules.groupRerolls)} oninput={(e) => setRule("groupRerolls", parseLimit(e.currentTarget.value))} />
                  次
                </label>
                {#if current.rules.drawVehicle}
                  <label class="inline-flex items-center gap-1.5" title="留空 = 不限次数（可随时重抽）">
                    载具可移出
                    <input class="{fieldInput} h-7 w-14 font-mono" type="number" min="0" max="20" placeholder="不限" value={limitValue(current.rules.vehicleRerolls)} oninput={(e) => setRule("vehicleRerolls", parseLimit(e.currentTarget.value))} />
                    次
                  </label>
                {/if}
              </div>
            </div>
          </div>
        {:else}
          <div class="space-y-1 text-xs">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-base font-bold text-foreground">{current.name}</span>
              <span class="rounded-md border px-2 py-0.5 font-semibold {POOL_TAG[current.event_type] || 'border-border'}">{VEHICLE_POOLS.find((t) => t.id === current.event_type)?.name || current.event_type}</span>
              <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono font-semibold text-muted-foreground">{modesLabel(current.game_modes)}</span>
            </div>
            <p class="text-muted-foreground">Ban / Pick：{rulesSummary(current.rules)}</p>
          </div>
        {/if}

        <div class="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <div class="min-w-0 flex-1 text-xs text-muted-foreground">
            <span class="font-semibold text-foreground">{rows.length}</span> 辆载具 ·
            <span class="font-semibold text-foreground">{groupCount}</span> 个分组
            {#if dirty}
              · <span class="font-semibold text-amber-600 dark:text-amber-400">{isNew ? "新模板，尚未保存" : "有未保存的修改"}</span>
            {:else if saved?.updated_at}
              · 更新于 {new Date(saved.updated_at).toLocaleString("zh-CN")}
            {/if}
            {#if isAdmin}
              <span class="block pt-0.5">Ban / Pick：{rulesSummary(current.rules)}</span>
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
              <UploadIcon class="h-3.5 w-3.5" /> 导入载具表
            </Button>
          {/if}
        </div>

        {#if isAdmin}
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={!dirty || !!problem || saving} onclick={save}>
              <CheckIcon class="h-3.5 w-3.5" /> {isNew ? "创建模板" : "保存"}
            </Button>
            {#if dirty}
              <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={saving} onclick={discard}>
                <XIcon class="h-3.5 w-3.5" /> {isNew ? "取消新建" : "放弃修改"}
              </Button>
            {/if}
            <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" onclick={addRow}>
              <PlusIcon class="h-3.5 w-3.5" /> 添加载具
            </Button>
            {#if !isNew}
              <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={!!drafts[NEW_ID]} title={drafts[NEW_ID] ? "先保存或取消正在新建的模板" : "以此模板为基础新建"} onclick={() => startNew(current)}>
                <CopyIcon class="h-3.5 w-3.5" /> 复制为新模板
              </Button>
              {#if confirmDelete}
                <span class="text-xs text-foreground">删除「{saved.name}」？指定了它的比赛会改回自动匹配。</span>
                <Button variant="destructive" size="sm" class="h-8 text-xs cursor-pointer" disabled={saving} onclick={remove}>确认删除</Button>
                <Button variant="outline" size="sm" class="h-8 text-xs cursor-pointer" onclick={() => (confirmDelete = false)}>取消</Button>
              {:else}
                <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer hover:text-red-500" disabled={saving} onclick={() => (confirmDelete = true)}>
                  <Trash2Icon class="h-3.5 w-3.5" /> 删除模板
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
                    <td class="px-1 py-0.5"><input aria-label="载具名称" class="{cellInput} font-semibold" value={v.name} oninput={(e) => editCell(i, "name", e.currentTarget.value)} /></td>
                    <td class="px-1 py-0.5"><input aria-label="国家" class={cellInput} value={v.nation} oninput={(e) => editCell(i, "nation", e.currentTarget.value)} /></td>
                    <td class="px-1 py-0.5"><input aria-label="BR" inputmode="decimal" class="{cellInput} font-mono" value={v.br ?? ""} oninput={(e) => editCell(i, "br", e.currentTarget.value)} /></td>
                    <td class="px-1 py-0.5"><input aria-label="类型" class={cellInput} value={v.type} oninput={(e) => editCell(i, "type", e.currentTarget.value)} /></td>
                    <td class="px-1 py-0.5"><input aria-label="分组" class={cellInput} value={v.group} placeholder={v.name} oninput={(e) => editCell(i, "group", e.currentTarget.value)} /></td>
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
          <code class="font-mono">name,nation,br,type,group</code> 的 CSV；只有 name 必填，分组留空时等于载具名称。导入只替换载具表，模板设置不变。
        </p>
      </div>
    {:else}
      <p class="py-8 text-center text-xs text-muted-foreground">还没有载具池模板</p>
    {/if}
  {/if}
</div>
