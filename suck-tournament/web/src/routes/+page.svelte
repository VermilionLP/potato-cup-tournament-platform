<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
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
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import SearchIcon from "@lucide/svelte/icons/search";

  let tournaments = $state([]);
  let players = $state([]);
  let loading = $state(true);

  // Player Management states
  let searchQuery = $state("");
  let showPlayerEditDialog = $state(false);
  let isCreatingPlayer = $state(false);
  
  let editingPlayerId = $state("");
  let editPlayerNewId = $state("");
  let editPlayerDisplayName = $state("");
  let editPlayerFlag = $state("cn");
  let editPlayerTeam = $state("");
  let editPlayerAlias = $state("");
  let editPlayerLink = $state("");
  let editPlayerBnetIds = $state([]);

  let filteredPlayers = $derived(
    players.filter(p => 
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.display_name || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function openEditPlayer(p) {
    isCreatingPlayer = false;
    editingPlayerId = p.id;
    editPlayerNewId = p.id;
    editPlayerDisplayName = p.display_name || p.id;
    editPlayerFlag = p.flag || "cn";
    editPlayerTeam = p.team || "";
    editPlayerAlias = p.alias || "";
    editPlayerLink = p.link || "";
    
    if (p.bnet_ids) {
      try {
        const ids = typeof p.bnet_ids === "string" ? JSON.parse(p.bnet_ids) : p.bnet_ids;
        if (Array.isArray(ids)) {
          editPlayerBnetIds = ids.map(item => typeof item === "string" ? { id: item, url: "" } : item);
        } else {
          editPlayerBnetIds = [];
        }
      } catch (_) {
        editPlayerBnetIds = [];
      }
    } else {
      editPlayerBnetIds = [];
    }
    showPlayerEditDialog = true;
  }

  function openCreatePlayer() {
    isCreatingPlayer = true;
    editingPlayerId = "";
    editPlayerNewId = "";
    editPlayerDisplayName = "";
    editPlayerFlag = "cn";
    editPlayerTeam = "";
    editPlayerAlias = "";
    editPlayerLink = "";
    editPlayerBnetIds = [];
    showPlayerEditDialog = true;
  }

  function removeBnetId(idx) {
    editPlayerBnetIds = editPlayerBnetIds.filter((_, i) => i !== idx);
  }

  async function handleSavePlayer() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }

    try {
      const cleanNewId = editPlayerNewId.trim();
      if (!cleanNewId) {
        toast.error("选手 ID 不能为空");
        return;
      }

      if (isCreatingPlayer) {
        const exists = players.some(p => p.id.toLowerCase() === cleanNewId.toLowerCase());
        if (exists) {
          toast.error("选手 ID 已存在");
          return;
        }
        toast.loading("正在创建选手...", { id: "player-save" });
      } else {
        if (cleanNewId !== editingPlayerId) {
          toast.loading("正在修改选手 ID 并同步数据...", { id: "player-save" });
          await API.renamePlayer(editingPlayerId, cleanNewId);
          editingPlayerId = cleanNewId;
        } else {
          toast.loading("正在更新选手资料...", { id: "player-save" });
        }
      }

      await API.updatePlayer(editingPlayerId, {
        display_name: editPlayerDisplayName || editingPlayerId,
        flag: editPlayerFlag,
        team: editPlayerTeam,
        alias: editPlayerAlias,
        link: editPlayerLink,
        bnet_ids: editPlayerBnetIds
      });

      toast.dismiss("player-save");
      toast.success(isCreatingPlayer ? "选手创建成功" : "选手资料更新成功");
      showPlayerEditDialog = false;
      await load();
    } catch (e) {
      toast.dismiss("player-save");
      toast.error("操作失败: " + e.message);
    }
  }

  // Modal creation states
  let showCreateDialog = $state(false);
  let newName = $state("");
  let newCapacity = $state(16);
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
      players = await API.listPlayers();
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
    <Tabs.Root value="active" class="w-full">
      <Tabs.List
        class="grid grid-cols-3 max-w-[420px] bg-muted/50 border border-border p-1 rounded-xl mb-6"
      >
        <Tabs.Trigger
          value="active"
          class="text-xs font-semibold py-1.5 rounded-lg data-[state=active]:bg-card transition-all cursor-pointer"
        >
          当前赛事
        </Tabs.Trigger>
        <Tabs.Trigger
          value="history"
          class="text-xs font-semibold py-1.5 rounded-lg data-[state=active]:bg-card transition-all cursor-pointer"
        >
          历史记录
        </Tabs.Trigger>
        <Tabs.Trigger
          value="players"
          class="text-xs font-semibold py-1.5 rounded-lg data-[state=active]:bg-card transition-all cursor-pointer"
        >
          选手管理
        </Tabs.Trigger>
      </Tabs.List>

      <!-- Active Tournaments Tab -->
      <Tabs.Content value="active" class="focus-visible:outline-none">
        {#if activeTournaments.length === 0}
          <div
            class="text-center py-16 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col items-center justify-center gap-3"
          >
            <UsersIcon class="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p class="text-sm font-semibold text-foreground">暂无活跃赛事</p>
              <p class="text-xs text-muted-foreground mt-1">
                点击右上角按钮创建一场新的 StarCraft 锦标赛
              </p>
            </div>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each activeTournaments as t (t.id)}
              <Card.Root
                class="group border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-primary/5"
              >
                <Card.Header class="p-5 pb-3">
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <Badge
                      variant="outline"
                      class="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider {getStatusStyle(
                        t.status,
                      )}"
                    >
                      {getStatusLabel(t.status)}
                    </Badge>
                    <span
                      class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded"
                    >
                      ID: {t.id}
                    </span>
                  </div>
                  <Card.Title
                    class="text-lg font-bold group-hover:text-primary transition-colors line-clamp-1"
                  >
                    {t.name}
                  </Card.Title>
                  <div class="mt-3.5 h-8 flex items-center">
                    {#if t.scheduled_time}
                      <div class="flex items-center gap-2 text-primary">
                        <ClockIcon
                          class="w-4.5 h-4.5 text-primary shrink-0 animate-pulse"
                        />
                        <span class="text-sm font-extrabold tracking-wide"
                          >{t.scheduled_time}</span
                        >
                      </div>
                    {:else if t.status === "voting"}
                      <div class="flex items-center gap-2 text-purple-400">
                        <ClockIcon
                          class="w-4.5 h-4.5 text-purple-400 shrink-0"
                        />
                        <span class="text-xs font-semibold italic"
                          >时间投票火热进行中...</span
                        >
                      </div>
                    {:else}
                      <div
                        class="flex items-center gap-2 text-muted-foreground/60"
                      >
                        <ClockIcon
                          class="w-4.5 h-4.5 text-muted-foreground/40 shrink-0"
                        />
                        <span class="text-xs font-medium italic"
                          >比赛时间待定...</span
                        >
                      </div>
                    {/if}
                  </div>
                </Card.Header>

                <Card.Content class="p-5 pt-0 pb-4 space-y-4">
                  <!-- Registered players progress -->
                  <div class="space-y-1.5">
                    <div
                      class="flex items-center justify-between text-xs font-semibold"
                    >
                      <span
                        class="text-muted-foreground flex items-center gap-1"
                      >
                        <UsersIcon class="w-3.5 h-3.5" />
                        已报名人数
                      </span>
                      <span class="text-foreground">
                        {t.player_count || 0} / {t.player_capacity}
                      </span>
                    </div>
                    <div
                      class="w-full h-1.5 bg-muted rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full bg-gradient-to-r from-amber-500 to-primary rounded-full transition-all duration-500"
                        style="width: {Math.min(
                          100,
                          ((t.player_count || 0) / t.player_capacity) * 100,
                        )}%"
                      ></div>
                    </div>
                  </div>

                  <!-- Date info -->
                  <div
                    class="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <CalendarIcon
                      class="w-3.5 h-3.5 text-muted-foreground/60"
                    />
                    <span
                      >创建于 {new Date(t.created_at).toLocaleDateString(
                        "zh-CN",
                      )}</span
                    >
                  </div>
                </Card.Content>

                <Card.Footer
                  class="p-5 pt-0 border-t border-border/40 bg-muted/10 group-hover:bg-muted/30 transition-colors flex items-center justify-end"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() =>
                      goto(`/tournament/${encodeURIComponent(t.id)}`)}
                    class="text-xs font-bold gap-1 text-primary hover:text-primary-foreground hover:bg-primary transition-all p-2.5 rounded-lg cursor-pointer"
                  >
                    进入赛事
                    <ArrowRightIcon class="w-3.5 h-3.5" />
                  </Button>
                </Card.Footer>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- History/Completed Tournaments Tab -->
      <Tabs.Content value="history" class="focus-visible:outline-none">
        {#if historyTournaments.length === 0}
          <div
            class="text-center py-16 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col items-center justify-center gap-3"
          >
            <CalendarIcon class="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p class="text-sm font-semibold text-foreground">
                暂无历史比赛记录
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                当有赛事完结并更改状态为已结束时，会移至此卡片区域
              </p>
            </div>
          </div>
        {:else}
          <div class="space-y-3">
            {#each historyTournaments as t (t.id)}
              <div
                class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-border bg-card/40 hover:bg-card/75 transition-all gap-4"
              >
                <div class="space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      class="font-bold text-foreground hover:text-primary transition-colors cursor-pointer text-sm sm:text-base text-left bg-transparent border-none p-0"
                      onclick={() =>
                        goto(`/tournament/${encodeURIComponent(t.id)}`)}
                    >
                      {t.name}
                    </button>
                    <Badge
                      variant="outline"
                      class="text-[9px] px-1.5 py-0 bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                    >
                      已完结
                    </Badge>
                  </div>
                  <div
                    class="flex items-center gap-3 text-xs text-muted-foreground font-mono"
                  >
                    <span>ID: {t.id}</span>
                    <span>•</span>
                    <span>选手: {t.player_count || 0}人</span>
                    {#if t.scheduled_time}
                      <span>•</span>
                      <span class="text-primary font-bold"
                        >时间: {t.scheduled_time}</span
                      >
                    {/if}
                    <span>•</span>
                    <span
                      >创建日期: {new Date(t.created_at).toLocaleDateString(
                        "zh-CN",
                      )}</span
                    >
                  </div>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => exportTournament(t.id, t.name)}
                    class="text-xs font-semibold gap-1 px-3 py-1.5 h-8 w-full sm:w-auto hover:bg-secondary cursor-pointer"
                  >
                    <DownloadIcon class="w-3.5 h-3.5" />
                    导出 JSON
                  </Button>
                  <Button
                    size="sm"
                    onclick={() =>
                      goto(`/tournament/${encodeURIComponent(t.id)}`)}
                    class="text-xs font-bold h-8 px-3.5 py-1.5 w-full sm:w-auto cursor-pointer"
                  >
                    查看 Bracket
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- Player Management Tab -->
      <Tabs.Content value="players" class="focus-visible:outline-none space-y-4">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/30 p-4 rounded-xl border border-border">
          <div class="relative flex-1 max-w-md">
            <SearchIcon class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <Input
              type="text"
              bind:value={searchQuery}
              placeholder="搜索选手 ID 或显示名称..."
              class="pl-10 bg-background border-border text-foreground text-xs"
            />
          </div>
          <Button
            size="sm"
            onclick={openCreatePlayer}
            class="text-xs font-bold gap-1.5 cursor-pointer shrink-0"
          >
            <PlusIcon class="w-4 h-4" /> 新增选手
          </Button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each filteredPlayers as p (p.id)}
            <Card.Root class="group border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm">
              <Card.Header class="p-5 pb-3">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-1.5">
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-bold uppercase">
                      {p.flag || "CN"}
                    </Badge>
                    {#if p.team}
                      <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-secondary/10 text-secondary border-secondary/20 font-semibold">
                        {p.team}
                      </Badge>
                    {/if}
                  </div>
                  <span class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                    ID: {p.id}
                  </span>
                </div>
                <Card.Title class="text-lg font-bold group-hover:text-primary transition-colors">
                  {p.display_name || p.id}
                </Card.Title>
                <div class="text-[11px] text-muted-foreground space-y-1 mt-2.5">
                  {#if p.alias}
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold">Wiki Alias:</span>
                      <span class="font-mono">{p.alias}</span>
                    </div>
                  {/if}
                  {#if p.link}
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold">Wiki Link:</span>
                      <span class="truncate block max-w-[200px]" title={p.link}>{p.link}</span>
                    </div>
                  {/if}
                </div>
              </Card.Header>

              <Card.Content class="p-5 pt-0 pb-3 space-y-2">
                <div class="text-[11px] font-bold text-muted-foreground">关联账号 (Battle.net IDs):</div>
                <div class="flex flex-wrap gap-1">
                  {#each typeof p.bnet_ids === 'string' ? JSON.parse(p.bnet_ids) : (p.bnet_ids || []) as b}
                    {@const bid = typeof b === 'string' ? b : b.id}
                    <Badge variant="secondary" class="text-[10px] bg-muted/50 hover:bg-muted text-foreground border border-border/60 py-0.5 px-2">
                      {bid}
                    </Badge>
                  {/each}
                  {#if (typeof p.bnet_ids === 'string' ? JSON.parse(p.bnet_ids) : (p.bnet_ids || [])).length === 0}
                    <span class="text-[10px] text-muted-foreground/60 italic">无关联账号</span>
                  {/if}
                </div>
              </Card.Content>

              <Card.Footer class="p-5 pt-0 border-t border-border/40 bg-muted/10 group-hover:bg-muted/30 transition-colors flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => openEditPlayer(p)}
                  class="text-xs font-bold gap-1 text-primary hover:text-primary-foreground hover:bg-primary transition-all p-2 rounded-lg cursor-pointer h-7"
                >
                  <SettingsIcon class="w-3.5 h-3.5" /> 编辑资料
                </Button>
              </Card.Footer>
            </Card.Root>
          {/each}
          {#if filteredPlayers.length === 0}
            <div class="col-span-full text-center py-16 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col items-center justify-center gap-2">
              <UsersIcon class="w-8 h-8 text-muted-foreground/40" />
              <p class="text-xs text-muted-foreground">没有找到符合条件的选手</p>
            </div>
          {/if}
        </div>
      </Tabs.Content>
    </Tabs.Root>
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

<!-- Participant Profile Edit/Create Dialog -->
<Dialog.Root bind:open={showPlayerEditDialog}>
  <Dialog.Content class="max-w-[420px] bg-card border border-border p-6 flex flex-col gap-4">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground flex items-center gap-2">
        <SettingsIcon class="w-5 h-5 text-primary" />
        {#if isCreatingPlayer}新建选手资料{:else}编辑选手资料{/if}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        配置选手的全球唯一唯一 ID、展示名称、国籍、战队前缀等 Wiki 信息。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-1.5">
        <label for="edit-player-id" class="text-xs font-bold text-muted-foreground">选手唯一 ID (Player ID)</label>
        <Input
          id="edit-player-id"
          bind:value={editPlayerNewId}
          placeholder="选手唯一 ID（创建后不可有重复，修改后将刷新全库）"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <div class="space-y-1.5">
        <label for="edit-display-name" class="text-xs font-bold text-muted-foreground">显示名称 (Display Name)</label>
        <Input
          id="edit-display-name"
          bind:value={editPlayerDisplayName}
          placeholder="选手显示名称"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="edit-flag" class="text-xs font-bold text-muted-foreground">国籍/地区 (Flag)</label>
          <Input
            id="edit-flag"
            bind:value={editPlayerFlag}
            placeholder="例如: cn, hk, tw"
            class="bg-background border-border text-foreground text-xs"
          />
        </div>
        <div class="space-y-1.5">
          <label for="edit-team" class="text-xs font-bold text-muted-foreground">默认战队前缀 (Team Tag)</label>
          <Input
            id="edit-team"
            bind:value={editPlayerTeam}
            placeholder="例如: AlphaX"
            class="bg-background border-border text-foreground text-xs"
          />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="edit-alias" class="text-xs font-bold text-muted-foreground">Wiki 别名 (Alias / Liquipedia ID)</label>
        <Input
          id="edit-alias"
          bind:value={editPlayerAlias}
          placeholder="Liquipedia ID, 为空则使用显示名称"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <div class="space-y-1.5">
        <span class="text-xs font-bold text-muted-foreground block">已关联游戏账号 (Battle.net IDs)</span>
        <div class="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-xl border border-border bg-background/30">
          {#each editPlayerBnetIds as account, idx}
            <Badge variant="secondary" class="gap-1 text-xs py-0.5 pl-2.5 pr-1.5 bg-muted/65 border border-border/60 hover:bg-muted text-foreground">
              <span>{account.id}</span>
              <button
                type="button"
                onclick={() => removeBnetId(idx)}
                class="text-muted-foreground hover:text-red-400 font-bold ml-1 transition-colors cursor-pointer text-sm"
                title="解除关联"
              >
                &times;
              </button>
            </Badge>
          {/each}
          {#if editPlayerBnetIds.length === 0}
            <span class="text-[10px] text-muted-foreground/60 italic self-center px-1">暂无关联的游戏账号（将通过录像上传自动匹配并关联）</span>
          {/if}
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="edit-link" class="text-xs font-bold text-muted-foreground">Wiki 个人页链接 (Link)</label>
        <Input
          id="edit-link"
          bind:value={editPlayerLink}
          placeholder="例如: User:Wayne19980"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showPlayerEditDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={handleSavePlayer}
        class="w-full sm:w-auto text-xs font-bold"
      >
        保存资料
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
