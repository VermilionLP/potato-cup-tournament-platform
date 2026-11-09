<script>
  // Vehicle pool templates used by Ban / Pick. Each template belongs to one
  // event type, can be limited to game modes and carries its own Ban / Pick
  // rules. Events use the best-matching template unless an admin picks one.
  // Everyone can view and export them; admins create, copy, edit and delete.
  // Draft and save helpers are in #lib/pool-editor.js.
  import { Chip } from "#lib/components/ui/chip/index.js";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { groupVehicles, rulesSummary } from "#lib/banpick.js";
  import { VEHICLE_POOLS } from "#lib/tournament.js";
  import { modesLabel, parsePoolFile, poolToCsv, poolToJson } from "#lib/vehicle-pools.js";
  import { NEW_ID, draftOf, draftProblem, emptyVehicle, newDraft, saveBody, templatesByType, toggleMode as toggled } from "#lib/pool-editor.js";
  import { downloadText } from "#lib/download.js";
  import TemplatePicker from "#lib/components/pools/TemplatePicker.svelte";
  import TemplateSettings from "#lib/components/pools/TemplateSettings.svelte";
  import VehicleTable from "#lib/components/pools/VehicleTable.svelte";
  import PoolPreview from "#lib/components/pools/PoolPreview.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Tag } from "#lib/components/ui/tag/index.js";
  import SearchIcon from "@lucide/svelte/icons/search";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import CheckIcon from "@lucide/svelte/icons/check";
  import XIcon from "@lucide/svelte/icons/x";
  import TableIcon from "@lucide/svelte/icons/table";
  import EyeIcon from "@lucide/svelte/icons/eye";

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
  // "table" = the vehicle list, "preview" = Ban / Pick as a match would show it.
  let view = $state("table");

  let saved = $derived(templates.find((t) => t.id === activeId) || null);
  let current = $derived(drafts[activeId] ?? saved);
  let dirty = $derived(Boolean(drafts[activeId]));
  let isNew = $derived(activeId === NEW_ID);
  let rows = $derived(current?.vehicles || []);
  let problem = $derived(dirty ? draftProblem(current) : "");
  let groupCount = $derived(groupVehicles(rows.filter((v) => String(v.name ?? "").trim())).length);

  // Templates by event type, in the order events choose them.
  let byType = $derived(templatesByType(templates, VEHICLE_POOLS));

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
    if (!drafts[activeId]) drafts[activeId] = draftOf(saved);
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
    d.game_modes = toggled(d.game_modes, mode);
  }

  function editCell(index, field, value) {
    draft().vehicles[index][field] = value;
  }

  function addRow() {
    draft().vehicles.push(emptyVehicle());
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
    drafts[NEW_ID] = newDraft(source, saved?.event_type || VEHICLE_POOLS[0].id);
    pick(NEW_ID);
  }

  async function save() {
    if (problem) return toast.error(problem);
    saving = true;
    try {
      const body = saveBody(current);
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
    const name = `vehicle-pool-${isNew ? "new" : activeId}.${kind}`;
    if (kind === "csv") downloadText(name, poolToCsv(rows), "text/csv;charset=utf-8");
    else downloadText(name, poolToJson(rows));
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
</script>

<svelte:head><title>载具池 · Potato Cup</title></svelte:head>

<!-- w-full min-w-0: with auto margins in the layout's flex column the page
     would otherwise grow to the vehicle table's width on phones. -->
<div class="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-1 sm:px-4 py-2 sm:py-6">
  <PageHeader title="载具池模板" icon={PlaneIcon} description="每种比赛类型的载具分组和 Ban / Pick 规则">
    {#snippet more()}
      <p>
        每个模板属于一种比赛类型，可以限定游戏模式，并带有自己的 Ban / Pick 规则。比赛默认自动使用同类型里最匹配游戏模式的模板（按排序），管理员也可以在赛事页手动指定。{isAdmin
          ? "可以新建、复制、编辑和删除模板，或导入 JSON / CSV 载具表。"
          : "可以导出载具表为 JSON / CSV。"}
      </p>
    {/snippet}
  </PageHeader>

  {#if loading}
    <PageSkeleton kind="table" label="加载中..." rows={6} />
  {:else}
    <!-- Templates grouped by event type -->
    <TemplatePicker {byType} {activeId} {drafts} {isAdmin} newId={NEW_ID} {isNew} onpick={pick} onnew={() => startNew(null)} />

    {#if current}
      <div class="rounded-xl border border-border bg-card/40">
        <!-- Header: the template, its tags and counts; export / import, copy, delete -->
        <div class="flex flex-wrap items-start gap-3 border-b border-border/60 px-3 py-3 sm:px-4">
          <div class="w-full min-w-0 space-y-1 sm:w-auto sm:flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate font-display text-2xl font-extrabold uppercase leading-tight">{current.name || "未命名模板"}</h2>
              <Tag>{VEHICLE_POOLS.find((t) => t.id === current.event_type)?.name || current.event_type}</Tag>
              <Tag class="num">{modesLabel(current.game_modes)}</Tag>
              {#if dirty}<Tag tone="prize">{isNew ? "新模板 · 未保存" : "未保存"}</Tag>{/if}
            </div>
            <p class="text-small text-muted-foreground">
              <span class="num font-bold text-foreground">{rows.length}</span> 辆载具 ·
              <span class="num font-bold text-foreground">{groupCount}</span> 个分组
              {#if !dirty && saved?.updated_at}· 更新于 {new Date(saved.updated_at).toLocaleString("zh-CN")}{/if}
              {#if !isAdmin}· Ban / Pick：{rulesSummary(current.rules)}{/if}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <div class="inline-flex overflow-hidden rounded-md border border-border">
              <button type="button" class="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-semibold hover:bg-muted cursor-pointer" onclick={() => download("json")} title="导出 JSON">
                <DownloadIcon class="h-3.5 w-3.5" /> JSON
              </button>
              <button type="button" class="inline-flex h-8 items-center gap-1.5 border-l border-border px-2.5 text-xs font-semibold hover:bg-muted cursor-pointer" onclick={() => download("csv")} title="导出 CSV">
                <DownloadIcon class="h-3.5 w-3.5" /> CSV
              </button>
              {#if isAdmin}
                <input bind:this={fileInput} type="file" accept=".json,.csv,application/json,text/csv" class="hidden" onchange={importFile} />
                <button type="button" class="inline-flex h-8 items-center gap-1.5 border-l border-border px-2.5 text-xs font-semibold hover:bg-muted cursor-pointer" onclick={() => fileInput?.click()} title="导入载具表（JSON / CSV），只替换载具">
                  <UploadIcon class="h-3.5 w-3.5" /> 导入
                </button>
              {/if}
            </div>
            {#if isAdmin && !isNew}
              <Button
                variant="outline"
                size="icon-sm"
                class="h-8 w-8 cursor-pointer"
                disabled={!!drafts[NEW_ID]}
                title={drafts[NEW_ID] ? "先保存或取消正在新建的模板" : "复制为新模板"}
                aria-label="复制为新模板"
                onclick={() => startNew(current)}
              >
                <CopyIcon class="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon-sm" class="h-8 w-8 cursor-pointer hover:text-red-500" disabled={saving} title="删除模板" aria-label="删除模板" onclick={() => (confirmDelete = true)}>
                <Trash2Icon class="h-3.5 w-3.5" />
              </Button>
            {/if}
          </div>
          {#if confirmDelete && !isNew}
            <div class="flex w-full flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
              <span class="flex-1 text-foreground">删除「{saved.name}」？指定了它的比赛会改回自动匹配。</span>
              <Button variant="destructive" size="sm" class="h-7 text-xs cursor-pointer" disabled={saving} onclick={remove}>确认删除</Button>
              <Button variant="outline" size="sm" class="h-7 text-xs cursor-pointer" onclick={() => (confirmDelete = false)}>取消</Button>
            </div>
          {/if}
        </div>

        <div class="space-y-4 p-3 sm:p-4">
          {#if isAdmin}
            <TemplateSettings {current} {isAdmin} onfield={setField} onrule={setRule} ontogglemode={toggleMode} />
          {/if}

          <!-- Vehicles: table or Ban / Pick preview -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex gap-1.5">
              <Chip selected={view === "table"} onclick={() => (view = "table")}><TableIcon class="h-3.5 w-3.5" /> 载具表</Chip>
              <Chip selected={view === "preview"} onclick={() => (view = "preview")}><EyeIcon class="h-3.5 w-3.5" /> Ban / Pick 预览</Chip>
            </div>
            {#if view === "table"}
              <div class="relative ml-auto w-full sm:w-64">
                <SearchIcon class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input bind:value={query} placeholder="搜索载具、国家、类型或分组..." class="h-8 pl-8 text-xs" />
              </div>
              {#if isAdmin}
                <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" onclick={addRow}>
                  <PlusIcon class="h-3.5 w-3.5" /> 添加载具
                </Button>
              {/if}
            {/if}
          </div>

          {#if view === "preview"}
            <PoolPreview templateId={activeId} {current} {rows} {dirty} />
          {:else}
            <VehicleTable {rows} {isAdmin} {query} onedit={editCell} onremove={removeRow} />
          {/if}
        </div>

        <!-- Unsaved changes: save bar pinned to the bottom of the window -->
        {#if isAdmin && dirty}
          <div class="sticky bottom-[calc(3.35rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-amber-500/30 bg-amber-50/95 px-3 py-2.5 backdrop-blur md:bottom-0 sm:px-4 dark:bg-amber-950/80">
            <span class="flex-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
              {problem || (isNew ? "新模板还没有创建" : "有未保存的修改")}
            </span>
            <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={saving} onclick={discard}>
              <XIcon class="h-3.5 w-3.5" /> {isNew ? "取消新建" : "放弃修改"}
            </Button>
            <Button size="sm" class="h-8 gap-1.5 text-xs cursor-pointer" disabled={!!problem || saving} onclick={save}>
              <CheckIcon class="h-3.5 w-3.5" /> {isNew ? "创建模板" : "保存"}
            </Button>
          </div>
        {/if}
      </div>
    {:else}
      <EmptyState compact title="还没有载具池模板" />
    {/if}
  {/if}
</div>
