<script>
  // Everyone: export a War Thunder TSS tournament (tss.warthunder.com) to
  // Liquipedia (main navigation, TSS 导出). The server reads the event from
  // TSS and builds the page (api routes/tss.js, lib/tss/wiki.js). Admins'
  // settings are saved on the server per TSS event (a new event starts from
  // the last one of the same kind); other people's are kept in their
  // browser (localStorage), per event.
  import PageHeader from "#lib/components/PageHeader.svelte";
  import TssGuide from "#lib/components/tss/TssGuide.svelte";
  import TssDraftLink from "#lib/components/tss/TssDraftLink.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { copyText } from "#lib/clipboard.js";
  import { formatInZone } from "#lib/datetime.js";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

  let isAdmin = $derived(!!userState.adminToken);
  let input = $state("");
  let recent = $state([]);
  let loading = $state(false);
  let building = $state(false);
  let info = $state(null); // { summary, matches, saved }
  let draft = $state(null); // settings being edited
  let text = $state("");
  let warnings = $state([]);
  let showMatches = $state(false);

  const SECTIONS = [
    { key: "format", label: "赛制 Format" },
    { key: "prize", label: "奖金 Prize Pool" },
    { key: "maps", label: "地图 Map Pool" },
    { key: "participants", label: "参赛名单 Participants" },
    { key: "results", label: "对阵和结果 Results" },
    { key: "description", label: "TSS 比赛说明" },
    { key: "trailer", label: "页尾分类等" },
  ];

  // A visitor's settings, per TSS event, in this browser.
  const LOCAL = "tss-settings:";
  function localSettings(id) {
    try {
      return JSON.parse(localStorage.getItem(LOCAL + id) || "null");
    } catch {
      return null;
    }
  }
  function keepLocal(id, settings) {
    try {
      localStorage.setItem(LOCAL + id, JSON.stringify(settings));
    } catch {
      /* private window: not kept */
    }
  }

  // "https://tss.warthunder.com/index.php?action=tournament&id=26354" or "26354".
  function idFrom(value) {
    const s = String(value || "").trim();
    return /[?&]id=(\d+)/.exec(s)?.[1] || (/^\d+$/.test(s) ? s : "");
  }

  async function loadRecent() {
    try {
      recent = (await API.getTssExports()).data || [];
    } catch {
      recent = [];
    }
  }

  async function open(value) {
    const id = idFrom(value);
    if (!id) {
      toast.error("请填 TSS 比赛 ID，或粘贴比赛页面的地址");
      return;
    }
    input = id;
    loading = true;
    text = "";
    warnings = [];
    try {
      const { data } = await API.getTss(id);
      info = data;
      const mine = isAdmin ? null : localSettings(id);
      draft = JSON.parse(JSON.stringify(mine ? { ...data.settings, ...mine } : data.settings));
      if (page.url.searchParams.get("id") !== id) goto(`?id=${id}`, { replaceState: true });
    } catch (e) {
      info = null;
      draft = null;
      toast.error(e.message);
    } finally {
      loading = false;
    }
  }

  async function build() {
    if (!info) return;
    building = true;
    try {
      const { data } = await API.saveTssWiki(info.summary.id, $state.snapshot(draft));
      text = data.wikiScript;
      warnings = data.warnings || [];
      draft = data.settings;
      if (data.saved) {
        info.saved = true;
        loadRecent();
      } else keepLocal(info.summary.id, data.settings);
    } catch (e) {
      toast.error(e.message);
    } finally {
      building = false;
    }
  }

  async function copy(e) {
    const ok = await copyText(text, { near: e?.currentTarget });
    if (ok) toast.success("已复制");
    else toast.error("复制失败，请手动全选复制");
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tss-${info.summary.id}.wiki.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Which matches the range keeps, to mark them in the list (the server checks
  // the text again; here a range it can't read just marks nothing).
  function inRange(m, filter) {
    const parts = String(filter?.ranges || "").split(/[,，;；\s]+/).filter(Boolean);
    if (!parts.length) return true;
    const n = Number(filter.by === "id" ? m.id : m.seq);
    return parts.some((p) => {
      const r = /^(\d+)?\s*[-~～]\s*(\d+)?$/.exec(p);
      if (r) return n >= (r[1] ? Number(r[1]) : -Infinity) && n <= (r[2] ? Number(r[2]) : Infinity);
      return /^\d+$/.test(p) && Number(p) === n;
    });
  }

  function stageText(s) {
    if (!s) return "";
    if (s.side === "upper") return `胜者组 第 ${s.round} 轮`;
    if (s.side === "lower") return `败者组 第 ${s.round} 轮`;
    if (s.side === "final") return "总决赛";
    if (s.side === "extra") return "附加赛";
    return `第 ${s.round} 轮`;
  }

  let summary = $derived(info?.summary);
  // The page name for the user-space draft link.
  let pageName = $derived(draft?.title || summary?.name || "");
  let pageDate = $derived(summary?.start || "");
  let matches = $derived(info?.matches || []);
  let shownCount = $derived(draft ? matches.filter((m) => inRange(m, draft.filter)).length : 0);
  let firstRound = $derived(draft && summary ? summary.upper_rounds.find((r) => r.round === Math.max(1, draft.startRound)) : null);

  onMount(() => {
    loadRecent();
    const id = page.url.searchParams.get("id");
    if (id) open(id);
  });

  const field = "field w-full";
  const label = "text-small font-semibold text-muted-foreground";
  const check = "flex items-center gap-2 text-xs text-foreground cursor-pointer";
  const box = "h-4 w-4 accent-[var(--primary)] cursor-pointer";
</script>

<svelte:head><title>TSS 导出 · Potato Cup</title></svelte:head>

<div class="space-y-4">
  <PageHeader title="TSS 导出" icon={FileTextIcon} description="把 TSS（tss.warthunder.com）上任意一场比赛导出成 Liquipedia 页面代码，复制后贴到 Liquipedia 即可。" />

  <TssGuide page={pageName} date={pageDate} />

    <form class="flex flex-wrap items-end gap-2" onsubmit={(e) => (e.preventDefault(), open(input))}>
      <label class="min-w-56 flex-1 space-y-1">
        <span class={label}>TSS 比赛 ID 或比赛页面地址</span>
        <input class={field} bind:value={input} placeholder="26354 或 https://tss.warthunder.com/index.php?action=tournament&id=26354" />
      </label>
      <Button type="submit" size="sm" disabled={loading} class="h-9 cursor-pointer text-xs font-semibold">{loading ? "读取中..." : "读取"}</Button>
    </form>

    {#if recent.length && !info}
      <section class="space-y-1.5">
        <h3 class="text-label font-bold uppercase tracking-wider text-muted-foreground">最近导出过</h3>
        <div class="divide-y divide-border/60 rounded-xl border border-border bg-card/40 text-xs">
          {#each recent as r (r.tss_id)}
            <button type="button" class="flex w-full items-baseline gap-3 px-4 py-2 text-left hover:bg-muted/50 cursor-pointer" onclick={() => open(r.tss_id)}>
              <span class="num shrink-0 text-muted-foreground">{r.tss_id}</span>
              <span class="min-w-0 flex-1 truncate font-semibold text-foreground">{r.name || "（没有名称）"}</span>
              <span class="shrink-0 text-small text-muted-foreground">{r.solo ? "1v1" : "团队"} · {formatInZone(new Date(r.updated_at))}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if info && draft}
      <section class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card/40 px-4 py-3 text-xs">
        <span class="text-sm font-bold text-foreground">{summary.name}</span>
        <span class="text-muted-foreground">{summary.solo ? "1v1" : `${summary.team_size}v${summary.team_size}`} · {summary.type}{summary.double ? "（双败）" : ""}</span>
        <span class="text-muted-foreground">{summary.start}{summary.end && summary.end !== summary.start ? ` – ${summary.end}` : ""}</span>
        <span class="text-muted-foreground">{summary.teams} {summary.solo ? "名选手" : "支队伍"}</span>
        {#if summary.status}<span class="rounded-full bg-muted px-2 py-0.5 font-semibold">{summary.status}</span>{/if}
        {#if !info.saved && isAdmin}<span class="text-small text-muted-foreground">第一次导出这场，设置沿用上一场同类比赛。</span>{/if}
        <a href="https://tss.warthunder.com/index.php?action=tournament&id={summary.id}" target="_blank" rel="noopener" class="ml-auto inline-flex items-center gap-1 text-brand-ink hover:underline">
          TSS 页面 <ExternalLinkIcon class="h-3.5 w-3.5" />
        </a>
      </section>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div class="space-y-4 text-xs">
          <section class="space-y-2">
            <h3 class="text-label font-bold uppercase tracking-wider text-muted-foreground">① 页面信息</h3>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="space-y-1 sm:col-span-2"><span class={label}>页面名称（留空用 TSS 上的名称加开赛日期）</span><input class={field} bind:value={draft.title} placeholder={summary.title || summary.name} /><span class="block text-small text-muted-foreground">只是页面上显示的标题，页面地址由你在 Liquipedia 上创建的页面决定。</span></label>
              <label class="space-y-1 sm:col-span-2"><span class={label}>系列 series</span><input class={field} bind:value={draft.series} placeholder="TSS" /></label>
              <label class="space-y-1">
                <span class={label}>Liquipedia 等级</span>
                <select class="{field} cursor-pointer" bind:value={draft.tier}>
                  <option value="">不填</option>
                  {#each ["1", "2", "3", "4", "5"] as n (n)}<option value={n}>Tier {n}</option>{/each}
                </select>
              </label>
              <label class="space-y-1"><span class={label}>等级类型</span><input class={field} bind:value={draft.tiertype} placeholder="Weekly / Qualifier / Showmatch" /></label>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="text-label font-bold uppercase tracking-wider text-muted-foreground">② 导出哪些部分</h3>
            <div class="grid grid-cols-2 gap-1.5">
              {#each SECTIONS as s (s.key)}
                <label class={check}><input type="checkbox" class={box} bind:checked={draft.sections[s.key]} />{s.label}</label>
              {/each}
            </div>
            <label class={check}><input type="checkbox" class={box} bind:checked={draft.goldenEagles} />奖金写成金鹰币（Golden Eagle）</label>
          </section>

          <section class="space-y-2">
            <h3 class="text-label font-bold uppercase tracking-wider text-muted-foreground">③ 选手和队伍</h3>
            <label class="block space-y-1">
              <span class={label}>对阵里怎么写参赛方</span>
              <select class="{field} cursor-pointer" bind:value={draft.opponent}>
                <option value="auto">自动（1v1 写选手，团队赛写队伍）</option>
                <option value="team">队伍模板 TeamOpponent</option>
                <option value="literal">纯文字（没有队伍页面时）</option>
                <option value="solo">选手 SoloOpponent</option>
              </select>
            </label>
            {#if !summary.solo}
              <label class={check}><input type="checkbox" class={box} bind:checked={draft.rosters} />参赛名单带上队员（逐队读取 TSS，队伍多时要等一会）</label>
              <div class="grid gap-2 sm:grid-cols-2">
                <label class="space-y-1"><span class={label}>名单只列前几名（0 = 全部）</span><input type="number" min="0" max="256" class={field} bind:value={draft.participantsTop} /></label>
                <label class="space-y-1"><span class={label}>晋级名额（标出前几名，0 = 不标）</span><input type="number" min="0" max="64" class={field} bind:value={draft.qualifiers} /></label>
              </div>
            {/if}
            <label class={check}><input type="checkbox" class={box} bind:checked={draft.cleanNames} />整理队名（下划线换成空格，去掉 [warning]）</label>
          </section>

          {#if summary.has_bracket}
            <section class="space-y-2">
              <h3 class="text-label font-bold uppercase tracking-wider text-muted-foreground">④ 对阵图范围</h3>
              <div class="space-y-1 rounded-md bg-muted/50 px-2.5 py-2 text-small text-muted-foreground">
                <p><span class="font-semibold text-foreground">一般不用改</span>，默认导出整个对阵图。只在比赛太大、Liquipedia 页面只需要其中一部分时用：</p>
                <ul class="list-disc space-y-0.5 pl-4">
                  <li><span class="font-semibold text-foreground">从胜者组第几轮开始</span>：参赛人数很多的比赛（例如 64、128 人），前几轮对局多又不重要，页面通常只放后面的淘汰阶段。比如选「16 进 8」那一轮，对阵图就从 16 强开始，之前的轮次不导出；双败赛的败者组也从对应的轮次开始。</li>
                  <li><span class="font-semibold text-foreground">只放这些比赛</span>：只导出其中一部分比赛，比如把一个很大的对阵图分成几段或几个页面。点下面的「查看比赛编号」找到编号（也可以改按 TSS 比赛 ID），写成 49-63、1-8 这样，60- 表示 60 号及以后。不在范围内的比赛，在对阵图上的位置留空；没有选起始轮次时，对阵图从所选比赛里最早的那一轮开始。</li>
                </ul>
              </div>
              <label class="block space-y-1">
                <span class={label}>从胜者组第几轮开始</span>
                <select class="{field} cursor-pointer" bind:value={draft.startRound}>
                  <option value={0}>从第 1 轮（全部）</option>
                  {#each summary.upper_rounds.slice(1) as r (r.round)}
                    <option value={r.round}>第 {r.round} 轮（{r.teams} 进 {r.teams / 2}）</option>
                  {/each}
                </select>
              </label>
              {#if firstRound && draft.startRound > 1}<p class="text-small text-muted-foreground">对阵图从 {firstRound.teams} 强开始。</p>{/if}
              <div class="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <label class="space-y-1">
                  <span class={label}>按什么筛选</span>
                  <select class="{field} cursor-pointer" bind:value={draft.filter.by}>
                    <option value="seq">比赛编号 #</option>
                    <option value="id">TSS 比赛 ID</option>
                  </select>
                </label>
                <label class="space-y-1"><span class={label}>只放这些比赛（留空 = 全部）</span><input class={field} bind:value={draft.filter.ranges} placeholder="49-63, 1-8, 60-" /></label>
              </div>
              <button type="button" class="text-small font-semibold text-brand-ink hover:underline cursor-pointer" onclick={() => (showMatches = !showMatches)}>
                {showMatches ? "收起比赛列表" : `查看比赛编号（共 ${matches.length} 场，选中 ${shownCount} 场）`}
              </button>
              {#if showMatches}
                <div class="max-h-72 overflow-y-auto rounded-lg border border-border/60">
                  <table class="w-full text-small">
                    <thead class="sticky top-0 bg-card text-muted-foreground">
                      <tr><th class="px-2 py-1 text-left">#</th><th class="px-2 py-1 text-left">TSS ID</th><th class="px-2 py-1 text-left">轮次</th><th class="px-2 py-1 text-left">对阵</th><th class="px-2 py-1 text-right">比分</th></tr>
                    </thead>
                    <tbody>
                      {#each matches as m (m.id)}
                        <tr class="border-t border-border/40 {inRange(m, draft.filter) ? '' : 'opacity-40'}">
                          <td class="num px-2 py-1">{m.seq}</td>
                          <td class="num px-2 py-1 text-muted-foreground">{m.id}</td>
                          <td class="px-2 py-1 whitespace-nowrap text-muted-foreground">{stageText(m.stage)}</td>
                          <td class="px-2 py-1">
                            <span class={m.winner === 1 ? "font-bold" : ""}>{m.a ?? "—"}</span>
                            <span class="text-muted-foreground"> vs </span>
                            <span class={m.winner === 2 ? "font-bold" : ""}>{m.b ?? "—"}</span>
                          </td>
                          <td class="num px-2 py-1 text-right">{m.score}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </section>
          {/if}

          <details class="rounded-lg border border-border/60 px-3 py-2">
            <summary class="cursor-pointer text-small font-semibold text-muted-foreground">高级选项</summary>
            <div class="mt-2 space-y-2">
              <label class={check}><input type="checkbox" class={box} bind:checked={draft.exactTimes} />逐场读取比赛时间（更准，比赛多时要等一会）</label>
              {#if draft.exactTimes}
                <label class="block space-y-1">
                  <span class={label}>比赛时间用</span>
                  <select class="{field} cursor-pointer" bind:value={draft.timeField}>
                    <option value="invite">邀请时间（TSS 上显示的开赛时间）</option>
                    <option value="start">进入战斗时间（晚 1 分钟）</option>
                  </select>
                </label>
              {/if}
              <label class="block space-y-1">
                <span class={label}>TSS 说明的语言</span>
                <select class="{field} cursor-pointer" bind:value={draft.lang}>
                  <option value="EN">英文</option>
                  <option value="RU">俄文</option>
                </select>
              </label>
              {#if summary.has_standings}
                <label class="block space-y-1"><span class={label}>积分榜颜色 bg（留空自动）</span><input class={field} bind:value={draft.standingsBg} placeholder="1=up, 2-3=stayup, 4-7=stay, 8-16=down" /></label>
              {/if}
            </div>
          </details>

          <Button size="sm" onclick={build} disabled={building} class="h-9 w-full cursor-pointer text-xs font-semibold">
            {building ? "正在读取 TSS 并生成..." : isAdmin ? "保存设置并生成代码" : "生成代码"}
          </Button>
          {#if !isAdmin}<p class="text-small text-muted-foreground">设置记在这台设备的浏览器里，下次打开这场比赛会沿用。</p>{/if}
        </div>

        <div class="flex min-h-96 flex-col gap-3">
          {#each warnings as w (w)}
            <p class="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-small text-amber-700 dark:text-amber-300">
              <TriangleAlertIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
            </p>
          {/each}
          <textarea
            readonly
            value={text}
            placeholder={isAdmin ? "填好左边的设置，点「保存设置并生成代码」。" : "填好左边的设置，点「生成代码」。"}
            class="min-h-96 w-full flex-1 resize-y rounded-md border border-border bg-background p-2 num text-small text-foreground focus:border-primary focus:outline-none"
          ></textarea>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" onclick={download} disabled={!text} class="h-9 flex-1 cursor-pointer gap-1.5 text-xs">
              <DownloadIcon class="h-3.5 w-3.5" /> 下载
            </Button>
            <Button size="sm" onclick={copy} disabled={!text} class="h-9 flex-1 cursor-pointer gap-1.5 text-xs font-semibold">
              <CopyIcon class="h-3.5 w-3.5" /> 复制 Wiki 代码
            </Button>
          </div>
          {#if text}
            <section class="space-y-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs">
              <p class="font-semibold">下一步：先粘贴到你自己的用户空间，预览核对后再移到正式页面，不要直接创建正式页面。</p>
              <TssDraftLink page={pageName} date={pageDate} />
            </section>
          {/if}
        </div>
      </div>
    {/if}
</div>
