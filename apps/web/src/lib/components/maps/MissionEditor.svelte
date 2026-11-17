<script>
  // Admins edit a 比赛地图 on /maps/<id>: the game settings (a form for the
  // usual ones), the vehicles each team may take, the file's text, the
  // versions (any can be downloaded or restored) and the page's own details.
  // Every save of the file is a new version on the server; a save started
  // from an older version is refused (someone else saved first).
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { askConfirm } from "#lib/confirm.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { ENVIRONMENTS, WEATHERS, fileSize, imageDataUrl, menuOptions, missionFile, timeLabel, weatherLabel } from "#lib/missions.js";
  import MissionThumb from "./MissionThumb.svelte";
  import ImageIcon from "@lucide/svelte/icons/image";
  import { missionProblems, parseUnitList } from "@potato-cup/shared/mission-blk.js";
  import SlidersIcon from "@lucide/svelte/icons/sliders-horizontal";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import FileCodeIcon from "@lucide/svelte/icons/file-code";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import InfoIcon from "@lucide/svelte/icons/info";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  // previous: { units } of the newest older version with a vehicle limit
  // (when this one has none), to turn it back on as it was.
  let { mission, versions = [], previous = null, onchange } = $props();

  /** @type {[string, string, any][]} */
  const TABS = [
    ["settings", "比赛设置", SlidersIcon],
    ["vehicles", "载具", PlaneIcon],
    ["raw", "原文", FileCodeIcon],
    ["versions", "版本", HistoryIcon],
    ["info", "资料", InfoIcon],
  ];
  let tab = $state("settings");
  let saving = $state(false);

  // The game settings (MISSION_FIELDS): label, input kind, help.
  const FIELDS = [
    ["locName", "游戏里显示的名称", "text", ""],
    ["locDesc", "游戏里显示的说明", "text", ""],
    ["scoreLimit", "得分上限", "number", "先拿到这么多分的一方获胜"],
    ["timeLimit", "时限（分钟）", "number", ""],
    ["environment", "时段", "env", ""],
    ["weather", "天气", "weather", ""],
    ["respawnTimeMultiplier", "重生时间倍率", "number", "0 = 立即重生"],
    ["deathPenaltyMul", "阵亡扣分倍率", "number", ""],
    ["isBotsAllowed", "允许 AI", "bool", ""],
    ["optionalTakeOff", "可以选择从跑道起飞", "bool", ""],
  ];

  // The duel ("gladiators") template's settings (DUEL_FIELDS): shown only
  // for files that have them (summary.duel; a null value = not in the file).
  const DUEL = [
    ["firstCountdown", "第一回合倒计时（秒）", "number", "开局后多久开始第一回合"],
    ["countdown", "回合间倒计时（秒）", "number", "两队进入战斗区域后倒数，归零开始下一回合"],
    ["shootingDelay", "出生后禁止开火（秒）", "number", "每回合出生后这段时间不能开火"],
    ["forfeitAfter", "缺席判负（秒）", "number", "一方没有存活的玩家时开始倒数，归零该方输掉这一回合"],
    ["spawnDistance", "两队出生点距离（米）", "number", "两队各自沿连线移动一半，中点不变"],
    ["spawnAltitude", "出生高度（米）", "number", ""],
    ["areaRadius", "战斗区域半径（米）", "number", "出界摧毁的边界跟着移动，和区域保持原来的距离"],
    ["firstHit", "先命中者胜", "bool", "被命中的一方几秒后强制跳伞；双方都被命中则一起跳伞"],
    ["bailoutDelay", "命中后跳伞（秒）", "number", "开启「先命中者胜」时有效"],
  ];

  // Forms start from the saved file each time it changes (a new version).
  let fields = $state({});
  /** @type {Record<string, any>} */
  let duel = $state({});
  let sameUnits = $state(true);
  let unitsA = $state("");
  let unitsB = $state("");
  let limitOn = $state(false);
  let raw = $state("");
  let rawLoaded = $state(0); // the version the text was loaded at
  let rawNote = $state("");
  /** @type {Record<string, any>} */
  let info = $state({});
  let seen = 0;
  $effect(() => {
    if (mission.version === seen) return;
    seen = mission.version;
    const f = mission.summary?.fields || {};
    fields = Object.fromEntries(FIELDS.map(([k]) => [k, f[k] ?? (FIELDS.find((x) => x[0] === k)[2] === "bool" ? false : "")]));
    duel = { ...(mission.summary?.duel || {}) };
    const u = mission.summary?.units;
    // No limit now: the form starts from the last list it had.
    const start = u || previous?.units;
    unitsA = (start?.teamA || []).join("\n");
    unitsB = (start?.teamB || []).join("\n");
    sameUnits = !start || unitsA === unitsB;
    limitOn = Boolean(u);
    rawLoaded = 0;
    info = { name: mission.name, location: mission.location || "", description: mission.description, credit: mission.credit, source_url: mission.source_url, hidden: mission.hidden, sort_order: mission.sort_order };
  });

  const savedFields = $derived(mission.summary?.fields || {});
  const savedDuel = $derived(mission.summary?.duel || null);
  const duelRows = $derived(savedDuel ? DUEL.filter(([k]) => savedDuel[k] !== null && savedDuel[k] !== undefined) : []);
  const changedDuel = $derived(Object.fromEntries(duelRows.map(([k]) => [k, duel[k]]).filter(([k, v]) => String(v ?? "") !== String(savedDuel[k]))));
  const changedFields = $derived(Object.fromEntries(Object.entries(fields).filter(([k, v]) => String(v ?? "") !== String(savedFields[k] ?? (typeof v === "boolean" ? false : "")))));
  const changeCount = $derived(Object.keys(changedFields).length + Object.keys(changedDuel).length);
  const unitsError = $derived.by(() => {
    try {
      parseUnitList(unitsA);
      if (!sameUnits) parseUnitList(unitsB);
      return "";
    } catch (e) {
      return e.message;
    }
  });
  const countOf = (text) => text.split(/[\s,，、]+/).filter(Boolean).length;
  const rawProblems = $derived(rawLoaded ? missionProblems(raw) : []);

  $effect(() => {
    if (tab === "raw" && rawLoaded !== mission.version) loadRaw();
  });
  async function loadRaw() {
    const v = mission.version;
    try {
      raw = await API.getMissionText(mission.id);
      rawLoaded = v;
      rawNote = "";
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function run(work, done) {
    saving = true;
    try {
      const res = await work();
      if (res?.unchanged) toast.info("没有改动");
      else toast.success(done);
      await onchange?.(res?.mission || null);
    } catch (e) {
      toast.error(e.message);
      // Someone else saved first: show their version.
      if (e.status === 409) await onchange?.(null);
    } finally {
      saving = false;
    }
  }

  const saveFields = () =>
    run(() => API.editMission(mission.id, { base_version: mission.version, fields: changedFields, duel: changedDuel }), "已保存比赛设置（新版本）");
  const limitSaved = $derived(Boolean(mission.summary?.vehicleLimit));
  const saveUnits = () => run(() => API.editMission(mission.id, { base_version: mission.version, vehicle_limit: true, units: { teamA: unitsA, teamB: sameUnits ? unitsA : unitsB } }), limitSaved ? "已保存载具（新版本）" : "已开启载具限制（新版本）");
  const saveNoLimit = () => run(() => API.editMission(mission.id, { base_version: mission.version, vehicle_limit: false }), "已关闭载具限制（新版本）");
  const saveRaw = () => run(() => API.editMission(mission.id, { base_version: rawLoaded, content: raw, note: rawNote.trim() || "修改原文" }), "已保存原文（新版本）");
  const saveInfo = () => run(() => API.updateMission(mission.id, info), "已保存资料");

  // The picture is saved at once (not with 保存资料).
  async function pickImage(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    let data;
    try {
      data = await imageDataUrl(file);
    } catch (err) {
      toast.error(err.message);
      return;
    }
    await run(() => API.uploadMissionImage(mission.id, data), "已更新缩略图");
  }
  async function removeImage() {
    if (!(await askConfirm("删除这张地图的缩略图？"))) return;
    await run(() => API.deleteMissionImage(mission.id), "已删除缩略图");
  }

  async function revert(v) {
    if (!(await askConfirm(`恢复到第 ${v} 版？会保存为一个新版本，之后还能再改回来。`))) return;
    await run(() => API.revertMission(mission.id, v), `已恢复到第 ${v} 版`);
  }
  async function remove() {
    if (!(await askConfirm(`删除地图「${mission.name}」？所有版本都会删除，开房链接也会失效，不能恢复。`, { danger: true, confirmText: "删除" }))) return;
    saving = true;
    try {
      await API.deleteMission(mission.id);
      toast.success("已删除");
      goto("/maps");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }

  const when = (t) => new Date(t).toLocaleString("zh-CN", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
</script>

<section class="rounded-xl border border-border bg-card">
  <div class="flex flex-wrap items-center gap-1 border-b border-border px-2 pt-2">
    <h2 class="mr-2 px-2 pb-2 text-sm font-bold">编辑地图</h2>
    {#each TABS as [key, label, Icon] (key)}
      <button
        type="button"
        onclick={() => (tab = key)}
        class="-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-sm font-semibold {tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
      ><Icon class="size-4" />{label}</button>
    {/each}
  </div>

  <div class="space-y-4 p-4">
    {#if tab === "settings"}
      {#if !mission.summary}
        <p class="text-sm text-loss">文件读不出来，请在「原文」里修改，或者恢复一个旧版本。</p>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2">
          {#each FIELDS as [key, label, kind, help] (key)}
            {#if kind === "bool"}
              <label class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                <input type="checkbox" bind:checked={fields[key]} class="size-4 accent-primary" />{label}
              </label>
            {:else}
              <div class="space-y-1 {key === 'locName' || key === 'locDesc' ? 'sm:col-span-2' : ''}">
                <label class="text-small font-semibold text-muted-foreground" for="mf-{key}">{label}</label>
                {#if kind === "number"}
                  <input id="mf-{key}" type="number" step="any" class="field w-full" bind:value={fields[key]} />
                {:else if kind === "env" || kind === "weather"}
                  <select id="mf-{key}" class="field w-full cursor-pointer" bind:value={fields[key]}>
                    {#each kind === "env" ? menuOptions(ENVIRONMENTS, timeLabel, savedFields[key]) : menuOptions(WEATHERS, weatherLabel, savedFields[key]) as o (o.value)}
                      <option value={o.value}>{o.label}</option>
                    {/each}
                  </select>
                {:else}
                  <input id="mf-{key}" class="field w-full" bind:value={fields[key]} spellcheck="false" />
                {/if}
                {#if help}<p class="text-small text-muted-foreground">{help}</p>{/if}
              </div>
            {/if}
          {/each}
        </div>
        {#if duelRows.length}
          <div class="space-y-3 rounded-lg border border-border p-3">
            <div>
              <h3 class="text-sm font-bold">决斗规则</h3>
              <p class="text-small text-muted-foreground">这个地图用的是决斗（gladiators）模板：回合、出生点和战斗区域由地图里的触发器和区域决定。</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              {#each duelRows as [key, label, kind, help] (key)}
                {#if kind === "bool"}
                  <label class="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
                    <input type="checkbox" bind:checked={duel[key]} class="mt-0.5 size-4 accent-primary" />
                    <span>{label}{#if help}<span class="block text-small font-normal text-muted-foreground">{help}</span>{/if}</span>
                  </label>
                {:else}
                  <div class="space-y-1">
                    <label class="text-small font-semibold text-muted-foreground" for="md-{key}">{label}</label>
                    <input id="md-{key}" type="number" step="any" min="0" class="field w-full" bind:value={duel[key]} disabled={key === "bailoutDelay" && !duel.firstHit} />
                    {#if help}<p class="text-small text-muted-foreground">{help}</p>{/if}
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
        <div class="flex items-center justify-end gap-2">
          <span class="text-small text-muted-foreground">{changeCount ? `改了 ${changeCount} 项` : "没有改动"}</span>
          <Button onclick={saveFields} disabled={saving || !changeCount}>保存设置</Button>
        </div>
        <p class="text-small text-muted-foreground">只改这些设置所在的那几行，文件其余内容保持原样。其他设置请在「原文」里改。</p>
      {/if}
    {:else if tab === "vehicles"}
      {#if !mission.summary}
        <p class="text-sm text-loss">文件读不出来，请在「原文」里修改，或者恢复一个旧版本。</p>
      {:else}
        <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <input type="checkbox" bind:checked={limitOn} class="mt-0.5 size-4 accent-primary" />
          <span>
            <span class="block text-sm font-semibold">限制载具</span>
            <span class="block text-small text-muted-foreground">开启：只能用下面列出的载具。关闭：玩家用自己的载具，按房间设置。</span>
          </span>
        </label>

        {#if limitOn}
          {#if !limitSaved}
            <p class="rounded-lg bg-primary/8 px-3 py-2 text-small text-brand-ink">{previous?.units ? "已填入这张地图上一次限制时的载具列表，可以修改后保存。" : "这张地图以前没有限制过载具，请填写可用的载具。"}</p>
          {/if}
          <label class="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" bind:checked={sameUnits} class="size-4 accent-primary" />两队可用的载具相同
          </label>
          <div class="grid gap-3 {sameUnits ? '' : 'sm:grid-cols-2'}">
            <div class="space-y-1">
              <label class="text-small font-semibold text-muted-foreground" for="mu-a">{sameUnits ? `两队（${countOf(unitsA)} 种）` : `A 队（${countOf(unitsA)} 种）`}</label>
              <textarea id="mu-a" class="field min-h-64 w-full py-2 font-mono text-xs" bind:value={unitsA} spellcheck="false"></textarea>
            </div>
            {#if !sameUnits}
              <div class="space-y-1">
                <label class="text-small font-semibold text-muted-foreground" for="mu-b">B 队（{countOf(unitsB)} 种）</label>
                <textarea id="mu-b" class="field min-h-64 w-full py-2 font-mono text-xs" bind:value={unitsB} spellcheck="false"></textarea>
              </div>
            {/if}
          </div>
          <p class="text-small text-muted-foreground">每行一个游戏内载具 ID（例如 f_15e、su_27sm），和 War Thunder wiki 载具页地址里的名字一样。</p>
          {#if unitsError}<p class="text-small font-semibold text-loss">{unitsError}</p>{/if}
          <div class="flex justify-end">
            <Button onclick={saveUnits} disabled={saving || Boolean(unitsError) || !countOf(unitsA) || (!sameUnits && !countOf(unitsB))}>{limitSaved ? "保存载具" : "开启载具限制"}</Button>
          </div>
        {:else if limitSaved}
          <p class="text-small text-muted-foreground">会从文件里删掉载具限制（customRules）。之后重新开启时，会自动填回现在的列表。</p>
          <div class="flex justify-end">
            <Button onclick={saveNoLimit} disabled={saving}>关闭载具限制</Button>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">现在不限制载具：玩家用自己的载具，按房间设置。</p>
        {/if}
      {/if}
    {:else if tab === "raw"}
      {#if !rawLoaded}
        <p class="text-sm text-muted-foreground">正在加载…</p>
      {:else}
        <textarea class="field min-h-[28rem] w-full py-2 font-mono text-xs leading-relaxed" bind:value={raw} spellcheck="false" aria-label="地图文件原文"></textarea>
        {#if rawProblems.length}
          <p class="text-small font-semibold text-loss">{rawProblems[0]}</p>
        {:else}
          <p class="text-small text-win">格式检查通过</p>
        {/if}
        <div class="flex flex-wrap items-center gap-2">
          <input class="field min-w-0 flex-1" bind:value={rawNote} placeholder="改了什么（写进版本记录）" />
          <Button variant="outline" onclick={loadRaw} disabled={saving}>放弃修改</Button>
          <Button onclick={saveRaw} disabled={saving || rawProblems.length > 0}>保存原文</Button>
        </div>
      {/if}
    {:else if tab === "versions"}
      <ul class="divide-y divide-border">
        {#each versions as v (v.version)}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span class="w-14 shrink-0 text-sm font-bold num">第 {v.version} 版</span>
            <span class="min-w-0 flex-1 text-sm">
              <span data-no-i18n={v.note && !/^(上传|从链接导入|修改设置|修改原文|修改载具|开启载具限制|关闭载具限制|恢复到第)/.test(v.note) ? "" : undefined}>{v.note || "—"}</span>
              <span class="text-small text-muted-foreground"> · {when(v.created_at)}{#if v.created_by} · <span data-no-i18n>{v.created_by}</span>{/if} · {fileSize(v.size)}</span>
            </span>
            {#if v.version === mission.version}
              <span class="text-small font-semibold text-brand-ink">当前</span>
            {:else}
              <Button size="sm" variant="outline" onclick={() => revert(v.version)} disabled={saving}><RotateCcwIcon class="size-3.5" />恢复</Button>
            {/if}
            <Button size="sm" variant="ghost" href={missionFile(mission.id, v.version)} download="{mission.id}-v{v.version}.blk" title="下载这个版本"><DownloadIcon class="size-3.5" /></Button>
          </li>
        {/each}
      </ul>
    {:else if tab === "info"}
      <div class="flex flex-wrap items-start gap-4 rounded-lg border border-border p-3">
        <MissionThumb {mission} class="w-56 max-w-full shrink-0 rounded-md" />
        <div class="min-w-0 flex-1 space-y-2">
          <p class="text-sm font-semibold">缩略图</p>
          <p class="text-small text-muted-foreground">显示在地图卡片和赛事页上，建议 16:9（例如 1280×720）。PNG、JPEG 或 WebP；太大的图片会自动缩小。没有图片时显示地点名称。</p>
          <div class="flex flex-wrap gap-2">
            <label class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted/60 {saving ? 'pointer-events-none opacity-50' : ''}">
              <ImageIcon class="size-4" />{mission.image_url ? "更换图片" : "上传图片"}
              <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" onchange={pickImage} />
            </label>
            {#if mission.image_url}<Button size="sm" variant="ghost" class="text-loss" onclick={removeImage} disabled={saving}>删除图片</Button>{/if}
          </div>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1">
          <label class="text-small font-semibold text-muted-foreground" for="mi-name">名称（网站上显示）</label>
          <input id="mi-name" class="field w-full" bind:value={info.name} />
        </div>
        <div class="space-y-1">
          <label class="text-small font-semibold text-muted-foreground" for="mi-location">地点</label>
          <input id="mi-location" class="field w-full" bind:value={info.location} placeholder="例如 Kursk、Eastern Europe" />
        </div>
        <div class="space-y-1">
          <label class="text-small font-semibold text-muted-foreground" for="mi-credit">作者 / 出处</label>
          <input id="mi-credit" class="field w-full" bind:value={info.credit} />
        </div>
        <div class="space-y-1 sm:col-span-2">
          <label class="text-small font-semibold text-muted-foreground" for="mi-desc">说明</label>
          <textarea id="mi-desc" class="field min-h-20 w-full py-1.5" bind:value={info.description}></textarea>
        </div>
        <div class="space-y-1">
          <label class="text-small font-semibold text-muted-foreground" for="mi-src">原始链接</label>
          <input id="mi-src" class="field w-full" bind:value={info.source_url} spellcheck="false" />
        </div>
        <div class="space-y-1">
          <label class="text-small font-semibold text-muted-foreground" for="mi-order">排序（小的在前）</label>
          <input id="mi-order" type="number" class="field w-full" bind:value={info.sort_order} />
        </div>
        <label class="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" bind:checked={info.hidden} class="size-4 accent-primary" />隐藏（只有管理员能看到，开房链接也会失效）
        </label>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" class="text-loss" onclick={remove} disabled={saving}><Trash2Icon class="size-4" />删除地图</Button>
        <Button onclick={saveInfo} disabled={saving}>保存资料</Button>
      </div>
    {/if}
  </div>
</section>
