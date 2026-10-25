<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { defaultVehiclePools } from "$lib/data/vehiclePools.js";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let tournaments = $state([]);
  let loading = $state(true);

  // Relative day helper (past and future).
  function relativeDay(value) {
    if (value == null) return "未知时间";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "未知时间";
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "今天";
    if (diff === 1) return "明天";
    if (diff === -1) return "昨天";
    if (diff > 0) return `${diff} 天后`;
    return `${-diff} 天前`;
  }

  function startTimeLabel(raw) {
    if (!raw) return "";
    const m = String(raw).match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[^\d]*(\d{1,2}):(\d{2})/,
    );
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const hh = String(m[4]).padStart(2, "0");
      const mm = String(m[5]).padStart(2, "0");
      return `${m[1]}/${String(m[2]).padStart(2, "0")}/${String(m[3]).padStart(2, "0")} ${weekdays[d.getDay()]} ${hh}:${mm}`;
    }
    const dm = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (dm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
      return `${dm[1]}/${String(dm[2]).padStart(2, "0")}/${String(dm[3]).padStart(2, "0")} ${weekdays[d.getDay()]}`;
    }
    return String(raw);
  }

  function ruleLabel(t) {
    return t?.loser_advances ? "败者晋级" : "胜者晋级";
  }

  function scheduledDateTime(t) {
    const raw = t?.scheduled_time;
    if (!raw) return null;
    const m = String(raw).match(
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[^\d]*(\d{1,2}):(\d{2}))?/,
    );
    if (!m) return null;
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      m[4] == null ? 20 : Number(m[4]),
      m[5] == null ? 0 : Number(m[5]),
    );
  }

  function countdownLabel(t) {
    const d = scheduledDateTime(t);
    if (!d) return "";
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return "已开赛";
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins} 分钟后`;
    const hours = Math.ceil(mins / 60);
    if (hours < 24) return `${hours} 小时后`;
    return `${Math.ceil(hours / 24)} 天后`;
  }

  function actionLabel(t) {
    if (t.status === "voting") return "去投票";
    if (t.status === "registration") return "去报名";
    if (t.status === "in_progress") return "看对阵";
    return "查看";
  }

  function displayCapacity(t) {
    const count = t?.player_count || 0;
    const tiers = [8, 16, 32, 64, 128];
    const tier = tiers.find((value) => value > count) ?? 128;
    return Math.min(Number(t?.player_capacity) || 128, tier);
  }

  // Best-known match date: prefer the scheduled match time, fall back to creation time.
  function getTournamentDate(t) {
    const raw = t?.scheduled_time;
    if (raw) {
      const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return t?.created_at ? new Date(t.created_at) : null;
  }

  const avatarColors = [
    "from-amber-500 to-orange-500",
    "from-purple-500 to-indigo-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-violet-500 to-fuchsia-500",
  ];

  function getGradient(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
    return avatarColors[s % avatarColors.length];
  }


  // Modal creation states
  let showCreateDialog = $state(false);
  let newName = $state("");
  let newCapacity = $state(128);
  let newLoserAdvances = $state(true);
  let newScheduledTime = $state("");
  let selectedVehiclePool = $state("proleague");
  let vehiclePools = $state(defaultVehiclePools);
  let creating = $state(false);

  // Divide tournaments
  let activeTournaments = $derived(
    tournaments.filter((t) => t.status !== "completed"),
  );
  let historyTournaments = $derived(
    tournaments.filter((t) => t.status === "completed"),
  );

  onMount(load);

  async function load() {
    loading = true;
    try {
      tournaments = await API.listTournaments();
    } catch (e) {
      toast.error("加载数据失败: " + e.message);
    }
    loading = false;
  }

  function openCreateDialog() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("创建赛事需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    newName = "";
    newCapacity = 128;
      newScheduledTime = "";
    newLoserAdvances = true;
    showCreateDialog = true;
  }

  async function createTournament() {
    const trimmedName = newName.trim();
    if (!trimmedName) return toast.error("请输入赛事名称");

    const generatedId = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!generatedId) {
      return toast.error("无法根据赛事名称生成合法的赛事 ID，请确保包含英文或数字");
    }

    if (newCapacity < 2 || newCapacity > 128) {
      return toast.error("选手容量必须在 2 至 128 人之间");
    }

    creating = true;
    try {
      await API.createTournament({
        id: generatedId,
        name: trimmedName,
        player_capacity: newCapacity,
        hold_third_place: 0,
        loser_advances: newLoserAdvances ? 1 : 0,
        scheduled_time: newScheduledTime || null
      });
      toast.success(`赛事创建成功！(生成 ID: ${generatedId})`);
      newName = "";
      newCapacity = 128;
      newScheduledTime = "";
      showCreateDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      creating = false;
    }
  }

  // Quick download export for historical tournaments
  async function exportTournament(tId, tName) {
    try {
      const details = await API.getTournament(tId);
      const json = JSON.stringify(details, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suck-tournament-${tId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${tName} 数据导出成功`);
    } catch (e) {
      toast.error("导出失败: " + e.message);
    }
  }

  function getStatusStyle(status) {
    return (
      {
        registration: "bg-sky-500/10 text-sky-400 border-sky-500/30",
        voting: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        in_progress: "bg-amber-500/10 text-primary border-primary/30",
        completed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
      }[status] || "bg-zinc-500/10 text-zinc-400"
    );
  }

  function getStatusLabel(status) {
    return (
      {
        registration: "报名中",
        voting: "投票中",
        in_progress: "比赛进行中",
        completed: "已结束",
      }[status] || status
    );
  }

  async function deleteTournament(id) {
    if (!confirm("确定删除该赛事？")) return;
    try {
      await fetch(`/api/tournaments/${id}`, { method: "DELETE" });
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error("删除失败");
    }
  }

</script>

<div class="space-y-6">
  <!-- Top Headline and Create trigger -->
  <div class="flex items-center justify-between border-b border-border/60 pb-5">
    <div>
      <h1
        class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent"
      >
        赛事大厅
      </h1>
      <p class="text-xs text-muted-foreground mt-1">
        管理并投票单淘汰赛事的首选工具
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <Button
        onclick={openCreateDialog}
        class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
      >
        <PlusIcon class="w-4 h-4" />
        创建赛事
      </Button>
    </div>
  </div>

  {#if loading}
    <div
      class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
    >
      <div
        class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
      ></div>
      <p class="text-sm">正在加载赛事数据...</p>
    </div>
  {:else}
    <!-- ── Active Tournaments ──────────────────────────────── -->
    {#if activeTournaments.length === 0}
      <div
        class="py-5 px-4 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left"
      >
        <div class="w-9 h-9 rounded-full bg-muted/60 border border-border/70 flex items-center justify-center shrink-0">
          <TrophyIcon class="w-4.5 h-4.5 text-muted-foreground/50" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground">暂无活跃赛事</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            可以直接创建一场新的 WarThunder 锦标赛。
          </p>
          {#if historyTournaments.length > 0}
            <div class="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
              <ClockIcon class="w-3 h-3 shrink-0" />
              <span>上次比赛：{relativeDay(getTournamentDate(historyTournaments[0]))}</span>
            </div>
          {/if}
        </div>
        <Button
          onclick={openCreateDialog}
          class="gap-1.5 font-bold text-xs shrink-0"
        >
          <PlusIcon class="w-4 h-4" />
          发起下一场锦标赛
        </Button>
      </div>
    {:else}
      <div class="divide-y divide-border border border-border bg-card/30 rounded-2xl overflow-hidden shadow-sm">
        {#each activeTournaments as t (t.id)}
          <div
            role="button"
            tabindex="0"
            onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}
            onkeydown={(e) => e.key === 'Enter' && goto(`/tournament/${encodeURIComponent(t.id)}`)}
            class="group flex flex-col md:flex-row md:items-center justify-between p-4.5 hover:bg-muted/40 transition-colors cursor-pointer gap-4"
          >
            <!-- Left: Avatar + Title -->
            <div class="flex items-center gap-4 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br {getGradient(t.id)} flex items-center justify-center text-white shrink-0 shadow-sm border border-white/10">
                <TrophyIcon class="w-5 h-5 text-white" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate max-w-[280px] sm:max-w-[400px]">
                    {t.name}<button onclick={(e)=>{e.stopPropagation();deleteTournament(t.id)}} class="ml-2 px-2 py-0.5 text-[10px] font-medium text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors">删除</button>
                  </h3>
                  <Badge variant="outline" class="text-[9px] px-2 py-0 font-bold uppercase tracking-wider {getStatusStyle(t.status)} shrink-0">
                    {getStatusLabel(t.status)}
                  </Badge>
                  <span class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.25 rounded shrink-0">ID: {t.id}</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>WarThunder 单败淘汰赛</span>
                  <span>·</span>
                  <span>{ruleLabel(t)}</span>
                </p>
              </div>
            </div>

            <!-- Right: Time + Players + Action -->
            <div class="flex items-center justify-between md:justify-end gap-6 shrink-0 flex-wrap md:flex-nowrap border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
              <!-- Time Info -->
              <div class="min-w-[205px]">
                {#if t.scheduled_time}
                  <div class="flex items-center gap-1.5 text-primary text-xs font-bold whitespace-nowrap tabular-nums">
                    <ClockIcon class="w-4 h-4 shrink-0 animate-pulse" />
                    <span>{startTimeLabel(t.scheduled_time)}</span>
                  </div>
                {:else if t.status === "voting"}
                  <div class="flex items-center gap-1.5 text-purple-400 text-xs font-semibold italic">
                    <ClockIcon class="w-4 h-4 shrink-0" />
                    <span>时间投票进行中...</span>
                  </div>
                {:else}
                  <div class="flex items-center gap-1.5 text-muted-foreground/60 text-xs font-medium italic">
                    <ClockIcon class="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    <span>比赛时间待定...</span>
                  </div>
                {/if}
                <div class="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                  {#if t.scheduled_time}
                    <span class="text-primary/80 font-bold">{countdownLabel(t)}</span>
                    <span class="mx-1">·</span>
                  {/if}
                  创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>

              <!-- Players Progress Bar -->
              <div class="flex items-center gap-3 w-[170px]">
                <div
                  class="flex items-center gap-1 text-xs text-muted-foreground font-semibold shrink-0"
                  title={`报名上限 ${t.player_capacity} 人`}
                >
                  <UsersIcon class="w-3.5 h-3.5" />
                  {#if t.status === "voting"}
                    <span>{t.voter_count || 0} 人投票</span>
                  {:else}
                    <span>{t.player_count || 0} / {displayCapacity(t)}</span>
                  {/if}
                </div>
                <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    style="width: {Math.min(100, ((t.status === 'voting' ? (t.voter_count || 0) : (t.player_count || 0)) / displayCapacity(t)) * 100)}%"></div>
                </div>
              </div>

              <!-- Action -->
              <div class="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/70 group-hover:text-primary transition-colors">
                <span>{actionLabel(t)}</span>
                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  <ArrowRightIcon class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- ── History Tournaments ────────────────────────────── -->
    {#if historyTournaments.length > 0}
      <div class="pt-4">
        <div class="flex items-center gap-3 mb-4">
          <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">历史记录</h2>
          <div class="flex-1 h-px bg-border/60"></div>
        </div>
        <div class="divide-y divide-border border border-border bg-card/15 rounded-2xl overflow-hidden shadow-sm">
          {#each historyTournaments as t (t.id)}
            <div
              role="button"
              tabindex="0"
              onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}
              onkeydown={(e) => e.key === 'Enter' && goto(`/tournament/${encodeURIComponent(t.id)}`)}
              class="group flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-muted/40 transition-colors cursor-pointer gap-3"
            >
              <!-- Left: Avatar + Title info -->
              <div class="flex items-center gap-3.5 min-w-0 flex-1">
                <div class="w-9 h-9 rounded-full bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground shrink-0 shadow-inner">
                  <TrophyIcon class="w-4.5 h-4.5 text-muted-foreground/50" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate max-w-[240px] sm:max-w-[360px]">
                      {t.name}<button onclick={(e)=>{e.stopPropagation();deleteTournament(t.id)}} class="ml-2 px-2 py-0.5 text-[10px] font-medium text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors">删除</button>
                    </h3>
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-zinc-500/10 text-zinc-400 border-zinc-500/20 shrink-0">已完结</Badge>
                    <span class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.25 rounded shrink-0">ID: {t.id}</span>
                  </div>
                  <p class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>WarThunder 单败淘汰赛</span>
                    <span>·</span>
                    <span>{ruleLabel(t)}</span>
                  </p>
                </div>
              </div>

              <!-- Right: Meta + Buttons -->
              <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0 flex-wrap sm:flex-nowrap border-t sm:border-t-0 border-border/40 pt-2.5 sm:pt-0">
                <div class="text-right sm:text-left">
                  <div class="grid grid-cols-1 sm:grid-cols-[205px_105px_110px] items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
                    <div class="flex items-center sm:justify-start justify-end gap-1 text-primary font-bold whitespace-nowrap tabular-nums">
                      <ClockIcon class="w-3.5 h-3.5 shrink-0" />
                      <span>{startTimeLabel(t.scheduled_time) || "时间未记录"}</span>
                    </div>
                    <div class="flex items-center sm:justify-start justify-end gap-1 bg-muted/40 border border-border/60 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                      <UsersIcon class="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <span>{t.player_count || 0} 人参赛</span>
                    </div>
                    <div class="flex items-center sm:justify-start justify-end gap-1 font-semibold text-zinc-400 whitespace-nowrap">
                      <span class="text-xs">✓</span>
                      <span>{relativeDay(getTournamentDate(t))}完赛</span>
                    </div>
                  </div>
                  <div class="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                    创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}
                  </div>
                </div>

                <!-- Buttons -->
                <div class="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={(e) => { e.stopPropagation(); exportTournament(t.id, t.name); }}
                    class="text-xs gap-1 px-2.5 h-7.5 hover:bg-secondary cursor-pointer border-border hover:text-foreground">
                    <DownloadIcon class="w-3 h-3" /> 导出
                  </Button>
                  <div class="hidden sm:flex items-center justify-center w-7.5 h-7.5 rounded-full bg-muted/30 group-hover:bg-muted group-hover:text-foreground transition-all duration-300">
                    <ArrowRightIcon class="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Create Tournament Dialog -->
<Dialog.Root bind:open={showCreateDialog}>
  <Dialog.Content class="max-w-[420px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground">
        创建新赛事
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        输入基本信息以初始化新单淘 WarThunder 赛事。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-4 py-3">
      <div class="space-y-1.5">
        <label
          for="create-name-input"
          class="text-xs font-bold text-muted-foreground">赛事名称</label
        >
        <Input
          id="create-name-input"
          bind:value={newName}
          placeholder="请输入赛事名称"
          class="bg-background border-border text-foreground"
        />
        <p class="text-[10px] text-muted-foreground/60">
        </p>
      </div>

      <div class="space-y-1.5">
        <label
          for="create-capacity-input"
          class="text-xs font-bold text-muted-foreground">选手上限</label
        >
        <Input
          id="create-capacity-input"
          type="number"
          bind:value={newCapacity}
          min="2"
          max="128"
          class="bg-background border-border text-foreground"
        />
      </div>
      <div class="space-y-1.5">
        <label for="create-time-input" class="text-xs font-bold text-muted-foreground">比赛时间</label>
        <Input
          id="create-time-input"
          type="datetime-local"
          bind:value={newScheduledTime}
          class="bg-background border-border text-foreground"
        />
        <p class="text-[10px] text-muted-foreground/60">设置后将直接开启报名，无需时间投票。</p>
      </div>

      
      <div class="space-y-1.5">
        <label class="text-xs font-bold text-muted-foreground">载具池</label>
        <select bind:value={selectedVehiclePool} class="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground">
          {#each vehiclePools as pool}
            <option value={pool.id}>{pool.name}</option>
          {/each}
        </select>

      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-bold text-muted-foreground block">晋级规则</label>
        <div class="flex items-center gap-4 text-xs pt-1">
          <label class="flex items-center gap-1.5 cursor-pointer text-foreground font-semibold">
            <input type="radio" bind:group={newLoserAdvances} value={false} class="accent-primary" />
            <span>胜者晋级</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="radio" bind:group={newLoserAdvances} value={true} class="accent-primary" />
            <span>败者晋级</span>
          </label>
        </div>
      </div>
    </div>
    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showCreateDialog = false)}
        disabled={creating}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={createTournament}
        disabled={creating}
        class="w-full sm:w-auto text-xs font-bold"
      >
        {#if creating}创建中...{:else}创建赛事{/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
