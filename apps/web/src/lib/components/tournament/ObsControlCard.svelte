<script>
  // OBS / stream controls for one live channel: stream mode, the live match,
  // the overlay scene and stage, and the browser-source links for OBS.
  // Consoles on the same channel share one overlay; different channels
  // (several streams / referees) are independent. `tournament` is the event
  // as the channel sees it (withChannel).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { copyText } from "#lib/clipboard.js";
  import { channelUrl } from "#lib/live-channels.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import CopyIcon from "@lucide/svelte/icons/copy";

  let {
    tournament,
    tid,
    channel = 1,
    channelChoices = [1],
    elsewhere = new Map(),
    isAdmin = false,
    streamMode = false,
    matchOrder,
    roundLabel,
    playerName,
    overlayMatches = [],
    overlayStageList = [],
    overlayShownStage = null,
    onstreamstart,
    onstreamend,
    onclearhud,
    onchannel,
  } = $props();

  // Stage for the intro-scene link ("" = the current stage).
  let introStage = $state("");
  const base = () => `${window.location.origin}/tournament/${tid}/overlay`;
  let autoUrl = $derived(channelUrl(base(), channel));
  let sceneLinks = $derived([
    {
      key: "intro",
      title: "1. 开场对阵 (Intro / 比赛列表)",
      url: channelUrl(`${base()}?scene=intro${introStage ? `&stage=${introStage}` : ""}`, channel),
      copied: "已复制开场对阵链接",
    },
    { key: "hybrid", title: "2. 对阵图 (树状对阵图 + 侧栏)", url: channelUrl(`${base()}?scene=hybrid`, channel), copied: "已复制对阵图链接" },
    { key: "ingame", title: "3. 游戏内 HUD (右上角选手+滚动比分)", url: channelUrl(`${base()}?scene=ingame`, channel), copied: "已复制游戏内 HUD 链接" },
    { key: "versus", title: "4. 对位预告 (直播对局或下一场的双方资料)", url: channelUrl(`${base()}?scene=versus`, channel), copied: "已复制对位预告链接" },
    { key: "banpick", title: "5. Ban / Pick (直播对局的禁用与抽取)", url: channelUrl(`${base()}?scene=banpick`, channel), copied: "已复制 Ban / Pick 链接" },
  ]);

  function copy(url, message) {
    copyText(url).then((ok) => (ok ? toast.success(message) : toast.error("复制失败，请手动选中链接复制")));
  }

  async function setActive(value) {
    try {
      await API.setActiveMatch(tid, value ? parseInt(value) : null, channel);
      if (!value) onclearhud?.();
      toast.success(value ? "当前直播对局已更新" : "已清除直播对局");
    } catch (err) {
      toast.error((value ? "更新直播对局失败: " : "") + err.message);
    }
  }

  async function setScene(value) {
    try {
      await API.setOverlayState(tid, value, tournament.overlay_round || Math.max(...(overlayMatches?.map((m) => m.round) || [1])), undefined, channel);
      onclearhud?.();
      toast.success("大屏显示场景已切换为: " + value.toUpperCase());
    } catch (err) {
      toast.error("切换大屏场景失败: " + err.message);
    }
  }

  async function setStage(key) {
    const stage = overlayStageList.find((st) => st.key === key);
    if (!stage) return;
    try {
      await API.setOverlayState(tid, tournament.overlay_scene || "intro", stage.round, stage.key, channel);
      toast.success("大屏展示轮次已更改为: " + stage.label);
    } catch (err) {
      toast.error("更改大屏轮次失败: " + err.message);
    }
  }

  let liveMatch = $derived(tournament.matches?.find((m) => m.id === tournament.active_match_id));
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3">
    <Card.Title class="text-sm font-bold flex items-center gap-2">
      <SettingsIcon class="w-4 h-4 text-brand-ink" />
      <span>OBS 直播大屏控制</span>
    </Card.Title>
  </Card.Header>
  <Card.Content class="p-5 pt-0 space-y-4 text-xs">
    {#if isAdmin}
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-muted-foreground shrink-0">直播频道:</span>
          <select
            class="h-8 rounded-md border border-input bg-background px-2 text-xs font-bold cursor-pointer"
            value={String(channel)}
            onchange={(e) => onchannel?.(Number(e.currentTarget.value))}
          >
            {#each channelChoices as c (c)}
              <option value={String(c)}>频道 {c}</option>
            {/each}
          </select>
        </div>
        <p class="text-small text-muted-foreground leading-normal">
          每个频道有自己的直播对局和大屏，下面的操作只影响当前频道。多路直播要共用一块大屏就选同一个频道，要各自独立就选不同频道。
        </p>
      </div>

      <div class="flex items-center justify-between gap-3 rounded-xl border p-3 {streamMode ? 'border-red-500/40 bg-red-500/10' : 'border-border bg-background/40'}">
        <div class="flex items-center gap-2.5">
          <RadioIcon class="w-4 h-4 shrink-0 {streamMode ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}" />
          <div>
            <div class="text-small font-bold">{streamMode ? "直播状态已激活" : "直播状态未激活"}</div>
            <div class="text-small text-muted-foreground leading-normal">
              激活后本页会强制选择下一场对局并自动切换大屏；仅影响本机，不影响其他访问者。
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={streamMode ? "destructive" : "default"}
          class="h-7 text-xs cursor-pointer shrink-0"
          onclick={streamMode ? onstreamend : onstreamstart}
        >
          {streamMode ? "结束直播" : "我要直播"}
        </Button>
      </div>

      <div class="space-y-2">
        <span class="font-semibold text-muted-foreground block">当前直播对局:</span>
        {#if tournament?.matches?.length > 0}
          <select
            class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={tournament.active_match_id || ""}
            onchange={(e) => setActive(e.currentTarget.value)}
          >
            <option value="">-- 未选择对局 --</option>
            {#each tournament.matches.filter((m) => m.player1_id && m.player2_id) as m (m.id)}
              {@const other = elsewhere.get(m.id)}
              <option value={m.id} disabled={Boolean(other)}>
                #{matchOrder.get(m.id)} 场次 {m.position} ({roundLabel(m)}): {playerName(m.player1_id)} vs {playerName(m.player2_id)} [{m.status === "completed" ? "完赛" : m.status === "walkover" ? "弃权" : "待赛"}]{other ? ` · 频道 ${other} 直播中` : ""}
              </option>
            {/each}
          </select>
          {#if liveMatch}
            <div class="p-2 rounded bg-primary/5 border border-primary/20 text-small text-brand-ink flex items-center justify-between">
              <span class="font-medium">直播中: {playerName(liveMatch.player1_id)} vs {playerName(liveMatch.player2_id)}</span>
              <button onclick={() => setActive(null)} class="hover:text-destructive font-bold text-xs shrink-0 cursor-pointer">清除</button>
            </div>
          {/if}
        {:else}
          <p class="text-muted-foreground text-small">暂无对局，请先生成 Bracket</p>
        {/if}
      </div>

      <div class="border-t border-border/40 pt-3 space-y-3">
        <span class="font-semibold text-muted-foreground block">直播大屏控制 (Overlay Control):</span>
        <div class="flex flex-col gap-2.5 bg-primary/5 p-3 rounded-xl border border-primary/20">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-brand-ink block text-small shrink-0">当前显示大屏:</span>
            <select
              class="flex h-8 rounded border border-primary/30 bg-background px-2 py-1 text-small text-brand-ink font-bold shadow-sm focus-visible:outline-none cursor-pointer"
              value={tournament.overlay_scene || "auto"}
              onchange={(e) => setScene(e.currentTarget.value)}
            >
              <option value="auto">Auto (智能自动模式)</option>
              <option value="intro">Intro (开场对阵轮次列表)</option>
              <option value="hybrid">Hybrid (场间树状对阵图)</option>
              <option value="ingame">HUD (游戏内选手面板)</option>
              <option value="versus">对位预告 (直播对局或下一场)</option>
              <option value="banpick">Ban / Pick (直播对局的禁用与抽取)</option>
            </select>
          </div>

          {#if tournament.overlay_scene === "intro"}
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-primary/10">
              <span class="text-small font-semibold text-muted-foreground shrink-0">展示轮次:</span>
              <select
                class="h-7 rounded border border-input bg-background px-2 text-small cursor-pointer"
                value={overlayShownStage?.key || ""}
                onchange={(e) => setStage(e.currentTarget.value)}
              >
                {#each overlayStageList as st (st.key)}
                  <option value={st.key}>{st.label}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="border-t border-border/40 pt-3 space-y-3">
      <span class="font-semibold text-muted-foreground block">
        {channel === 1 ? "OBS 浏览器源链接:" : `OBS 浏览器源链接（频道 ${channel}）:`}
      </span>

      <div class="space-y-2.5">
        <div class="space-y-1.5 p-2.5 rounded-xl border border-primary/20 bg-primary/5">
          <span class="font-bold text-brand-ink block text-small">✨ 推荐：全自动智能切换直播源 (Unified Auto)</span>
          <span class="text-small text-muted-foreground block leading-normal mb-1">
            放入 OBS 浏览器源即可，跟随上面「当前显示大屏」的选择。选 Auto 时：直播对局开启了 Ban/Pick 且结果未确认时显示 Ban/Pick 画面，确认后（或已保存实时比分时）显示游戏 HUD（透明底）；无直播对局时显示场间对阵大屏（深色底）。
          </span>
          <div class="flex items-center gap-1.5">
            <input
              type="text"
              readonly
              class="flex-1 h-7 px-2 border border-primary/25 rounded bg-background text-small select-all cursor-default text-brand-ink num"
              value={autoUrl}
            />
            <Button
              size="icon-xs"
              class="h-7 w-7 cursor-pointer shrink-0 bg-primary text-black hover:bg-primary/90"
              onclick={() => copy(autoUrl, "已复制全自动智能直播源链接")}
            >
              <CopyIcon class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div class="h-px bg-border/40 my-2"></div>
        <span class="text-small font-bold text-muted-foreground block">特定单场景链接 (如有需要手动配置):</span>

        {#each sceneLinks as link (link.key)}
          <div class="space-y-1">
            <div class="flex justify-between items-center">
              <span class="font-medium">{link.title}</span>
              {#if link.key === "intro"}
                <div class="flex items-center gap-1">
                  <span class="text-small text-muted-foreground">轮次:</span>
                  <select class="h-5 rounded border border-input bg-background px-1 text-small" bind:value={introStage}>
                    <option value="">当前轮次（自动）</option>
                    {#each overlayStageList as st (st.key)}
                      <option value={st.key}>{st.label}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
            <div class="flex items-center gap-1.5">
              <input
                type="text"
                readonly
                class="flex-1 h-7 px-2 border border-input rounded bg-muted/30 text-small select-all cursor-default"
                value={link.url}
              />
              <Button size="icon-xs" variant="outline" class="h-7 w-7 cursor-pointer shrink-0" onclick={() => copy(link.url, link.copied)}>
                <CopyIcon class="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </Card.Content>
</Card.Root>
