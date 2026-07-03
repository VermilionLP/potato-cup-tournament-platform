<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import TrophyIcon from "@lucide/svelte/icons/trophy";

  let tournaments = $state([]);
  let loading = $state(true);

  // Relative time helper
  function daysAgo(dateStr) {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff === 0) return "今天";
    if (diff === 1) return "昨天";
    return `${diff} 天前`;
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
  let newCapacity = $state(16);
  let newLoserAdvances = $state(true);
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
    newCapacity = 16;
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

    if (newCapacity < 2 || newCapacity > 16) {
      return toast.error("选手容量必须在 2 至 16 人之间");
    }

    creating = true;
    try {
      await API.createTournament({
        id: generatedId,
        name: trimmedName,
        player_capacity: newCapacity,
        hold_third_place: 0,
        loser_advances: newLoserAdvances ? 1 : 0
      });
      toast.success(`赛事创建成功！(生成 ID: ${generatedId})`);
      newName = "";
      newCapacity = 16;
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
    <Button
      onclick={openCreateDialog}
      class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
    >
      <PlusIcon class="w-4 h-4" />
      创建赛事
    </Button>
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
      <div class="text-center py-16 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col items-center justify-center gap-3">
        <UsersIcon class="w-10 h-10 text-muted-foreground/40" />
        <div>
          <p class="text-sm font-semibold text-foreground">暂无活跃赛事</p>
          <p class="text-xs text-muted-foreground mt-1">点击右上角按钮创建一场新的 StarCraft 锦标赛</p>
          {#if historyTournaments.length > 0}
            <div class="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/60 border border-border/80 text-xs text-muted-foreground font-semibold shadow-sm">
              <ClockIcon class="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
              <span>上次比赛：{daysAgo(historyTournaments[0].created_at)}</span>
            </div>
          {/if}
        </div>
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
                    {t.name}
                  </h3>
                  <Badge variant="outline" class="text-[9px] px-2 py-0 font-bold uppercase tracking-wider {getStatusStyle(t.status)} shrink-0">
                    {getStatusLabel(t.status)}
                  </Badge>
                  <span class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.25 rounded shrink-0">ID: {t.id}</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>StarCraft II 单败淘汰赛</span>
                  <span>·</span>
                  <span>创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}</span>
                </p>
              </div>
            </div>

            <!-- Right: Time + Players + Action -->
            <div class="flex items-center justify-between md:justify-end gap-6 shrink-0 flex-wrap md:flex-nowrap border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
              <!-- Time Info -->
              <div class="min-w-[150px]">
                {#if t.scheduled_time}
                  <div class="flex items-center gap-1.5 text-primary text-xs font-bold">
                    <ClockIcon class="w-4 h-4 shrink-0 animate-pulse" />
                    <span>{t.scheduled_time}</span>
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
              </div>

              <!-- Players Progress Bar -->
              <div class="flex items-center gap-3 w-[160px]">
                <div class="flex items-center gap-1 text-xs text-muted-foreground font-semibold shrink-0">
                  <UsersIcon class="w-3.5 h-3.5" />
                  <span>{t.player_count || 0} / {t.player_capacity}</span>
                </div>
                <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    style="width: {Math.min(100, ((t.player_count || 0) / t.player_capacity) * 100)}%"></div>
                </div>
              </div>

              <!-- Action Arrow -->
              <div class="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-muted/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                <ArrowRightIcon class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
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
                      {t.name}
                    </h3>
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-zinc-500/10 text-zinc-400 border-zinc-500/20 shrink-0">已完结</Badge>
                    <span class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.25 rounded shrink-0">ID: {t.id}</span>
                  </div>
                  <p class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>已于 {daysAgo(t.created_at)} 完结</span>
                    <span>·</span>
                    <span>创建于 {new Date(t.created_at).toLocaleDateString("zh-CN")}</span>
                  </p>
                </div>
              </div>

              <!-- Right: Meta + Buttons -->
              <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0 flex-wrap sm:flex-nowrap border-t sm:border-t-0 border-border/40 pt-2.5 sm:pt-0">
                <div class="flex items-center gap-3 text-xs text-muted-foreground/80">
                  <!-- Player count -->
                  <div class="flex items-center gap-1 bg-muted/40 border border-border/60 px-2 py-0.5 rounded-full font-medium">
                    <UsersIcon class="w-3 h-3 text-muted-foreground/50" />
                    <span>{t.player_count || 0} 人参赛</span>
                  </div>
                  <!-- Completed date -->
                  <div class="flex items-center gap-1 font-semibold text-zinc-400">
                    <span class="text-xs">✓</span>
                    <span>{new Date(t.created_at).toLocaleDateString("zh-CN", { month: "short", year: "numeric" })}</span>
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
        输入基本信息以初始化新单淘 StarCraft 赛事。
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
          placeholder="如: StarCraft Ultra Chicken King #50"
          class="bg-background border-border text-foreground"
        />
        <p class="text-[10px] text-muted-foreground/60">
          系统会根据赛事名称自动生成简洁的赛事 ID (例如输入 SUCK#41 将自动转换为 suck41)。
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
          max="16"
          class="bg-background border-border text-foreground"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-bold text-muted-foreground block">晋级规则</label>
        <div class="flex items-center gap-4 text-xs pt-1">
          <label class="flex items-center gap-1.5 cursor-pointer text-foreground font-semibold">
            <input type="radio" bind:group={newLoserAdvances} value={true} class="accent-primary" />
            <span>败者晋级 (SUCK 经典)</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="radio" bind:group={newLoserAdvances} value={false} class="accent-primary" />
            <span>胜者晋级 (常规单淘)</span>
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
