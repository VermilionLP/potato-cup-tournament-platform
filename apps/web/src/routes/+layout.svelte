<script>
  import "../app.css";
  import { onMount } from "svelte";
  import { Toaster, toast } from "svelte-sonner";
  import { userState } from "$lib/user.svelte.js";
  import { API } from "$lib/api.js";
  import { page } from "$app/stores";
  import { ModeWatcher, toggleMode } from "mode-watcher";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UsersIcon from "@lucide/svelte/icons/users";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let { children } = $props();

  let openIdDialog = $state(false);
  let idInput = $state("");
  let existingPlayers = $state([]);
  let qqInput = $state("");
  let qqError = $state("");
  let verifying = $state(false);

  // Profile fields state
  let editFlag = $state("cn");
  let editTeam = $state("");
  let editLink = $state("");
  let editBattleTags = $state({ cn: [], global: [] });
  let editBnetIds = $state([]);

  // Avatar gradient derived from player ID
  const avatarColors = [
    "from-amber-500 to-orange-600",
    "from-purple-500 to-indigo-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-violet-500 to-fuchsia-600",
  ];

  let avatarGradient = $derived.by(() => {
    if (!userState.id) return avatarColors[0];
    let sum = 0;
    for (let i = 0; i < userState.id.length; i++) {
      sum += userState.id.charCodeAt(i);
    }
    return avatarColors[sum % avatarColors.length];
  });

  onMount(() => {
    if (userState.id) {
      checkProfileCompleteness(userState.id);
    }
  });

  function parseBnetIds(raw) {
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        return parsed.map((item) =>
          typeof item === "string" ? { id: item, url: "" } : item,
        );
      }
    } catch (_) {}
    return [];
  }

  async function checkProfileCompleteness(playerId) {
    try {
      const player = await API.getPlayer(playerId);
      if (player) {
        let parsedTags = {};
        if (player.battle_tags) {
          try {
            parsedTags =
              typeof player.battle_tags === "string"
                ? JSON.parse(player.battle_tags)
                : player.battle_tags;
          } catch (_) {}
        }
        const cnTags = Array.isArray(parsedTags.cn) ? parsedTags.cn : [];
        const globalTags = Array.isArray(parsedTags.global)
          ? parsedTags.global
          : [];
        if (cnTags.length === 0 && globalTags.length === 0) {
          toast.warning("您的 BattleTag 尚未填写，可能会影响录像自动匹配。", {
            action: {
              label: "立即完善",
              onClick: () => handleOpenDialog(),
            },
            duration: 10000,
          });
        }
      }
    } catch (e) {
      console.error("检查个人资料完整性失败:", e);
    }
  }

  async function handleOpenDialog() {
    idInput = userState.id || "";
    qqInput = userState.qqGroup || "";
    qqError = "";
    openIdDialog = true;

    if (userState.id) {
      try {
        const p = await API.getPlayer(userState.id);
        if (p) {
          editFlag = p.flag || "cn";
          editTeam = p.team || "";
          editLink = p.link || "";

          let parsedTags = {};
          if (p.battle_tags) {
            try {
              parsedTags =
                typeof p.battle_tags === "string"
                  ? JSON.parse(p.battle_tags)
                  : p.battle_tags;
            } catch (_) {}
          }
          const parseToArray = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.filter(Boolean);
            if (typeof val === "string")
              return val
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            return [];
          };
          editBattleTags = {
            cn: parseToArray(parsedTags.cn),
            global: parseToArray(parsedTags.global),
          };
          editBnetIds = parseBnetIds(p.bnet_ids);
        }
      } catch (e) {
        console.error("获取选手资料失败:", e);
        toast.error("获取选手资料失败: " + e.message);
      }
    } else {
      try {
        existingPlayers = await API.listPlayers();
      } catch (e) {
        console.error("加载选手列表失败:", e);
      }
    }
  }

  async function handleSaveId() {
    const trimmedQQ = qqInput.trim();
    const trimmedId = idInput.trim();
    if (!trimmedQQ) {
      qqError = "请输入 QQ 群号";
      return;
    }
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    verifying = true;
    qqError = "";
    try {
      const res = await API.verifyQQ(trimmedQQ);
      if (res.valid) {
        userState.setQQGroup(trimmedQQ);
        userState.setId(trimmedId);
        openIdDialog = false;
        toast.success("身份配置已保存并激活权限！");
        checkProfileCompleteness(trimmedId);
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        qqError = "验证未通过，请输入正确的 SUCK 水友群号";
        toast.error("群号验证失败！");
      }
    } catch (err) {
      qqError = "验证请求发生错误，请稍后重试";
      toast.error("网络错误，请稍后重试");
      console.error(err);
    } finally {
      verifying = false;
    }
  }

  async function handleSaveProfile() {
    const trimmedQQ = qqInput.trim();
    const trimmedId = idInput.trim();
    if (!trimmedQQ) {
      qqError = "请输入 QQ 群号";
      return;
    }
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    // 1. Verify QQ Group if it changed
    if (trimmedQQ !== userState.qqGroup) {
      verifying = true;
      qqError = "";
      try {
        const res = await API.verifyQQ(trimmedQQ);
        if (!res.valid) {
          qqError = "验证未通过，请输入正确的 SUCK 水友群号";
          toast.error("群号验证失败！");
          verifying = false;
          return;
        }
        userState.setQQGroup(trimmedQQ);
      } catch (err) {
        qqError = "验证请求发生错误，请稍后重试";
        toast.error("网络错误，请稍后重试");
        console.error(err);
        verifying = false;
        return;
      } finally {
        verifying = false;
      }
    }

    // 2. Handle Player ID rename ("两边一起改")
    const oldId = userState.id;
    if (trimmedId !== oldId) {
      const confirmed = confirm(
        `确定要将选手 ID 从 "${oldId}" 修改为 "${trimmedId}" 吗？\n此操作将同步更新所有历史赛事对阵、报名和投票数据。`,
      );
      if (!confirmed) return;

      verifying = true;
      try {
        await API.renamePlayer(oldId, trimmedId);
        userState.setId(trimmedId);
        toast.success("选手 ID 修改成功！");
      } catch (err) {
        toast.error("修改选手 ID 失败: " + err.message);
        verifying = false;
        return;
      } finally {
        verifying = false;
      }
    }

    // 3. Save profile details
    verifying = true;
    try {
      await API.updatePlayer(trimmedId, {
        flag: editFlag || "cn",
        team: editTeam || "",
        link: editLink || "",
        battle_tags: editBattleTags,
      });
      toast.success("个人资料保存成功！");
      openIdDialog = false;
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (err) {
      toast.error("保存个人资料失败: " + err.message);
    } finally {
      verifying = false;
    }
  }

  function handleClearId() {
    userState.setId("");
    userState.setQQGroup("");
    idInput = "";
    qqInput = "";
    openIdDialog = false;
    toast.success("已退出身份，目前为只读查看模式");
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }
</script>

<ModeWatcher defaultMode="dark" />

<div
  class="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30"
>
  <!-- Top Bar -->
  <header
    class="sticky top-0 z-40 w-full border-b border-border/60 bg-background/90 backdrop-blur-sm"
  >
    <div
      class="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2 sm:gap-6"
    >
      <!-- Left: Logo -->
      <a href="/" class="flex items-center gap-1.5 sm:gap-2.5 shrink-0 group">
        <div
          class="w-7 h-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center group-hover:bg-primary/25 transition-colors"
        >
          <TrophyIcon class="w-4 h-4 text-primary" />
        </div>
        <span
          class="font-bold text-sm sm:text-base tracking-tight text-foreground group-hover:text-primary transition-colors"
        >
          SUCK
          <span
            class="hidden sm:inline font-normal text-muted-foreground text-sm ml-1"
            >Tournament</span
          >
        </span>
      </a>

      <!-- Center-left: Nav links -->
      <nav class="flex items-center gap-0.5">
        <a
          href="/"
          class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors
            {$page.url.pathname === '/'
            ? 'text-primary font-semibold bg-primary/8'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
        >
          <TrophyIcon class="w-3.5 h-3.5" />
          赛事大厅
        </a>
        <a
          href="/players"
          class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors
            {$page.url.pathname.startsWith('/players')
            ? 'text-primary font-semibold bg-primary/8'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
        >
          <UsersIcon class="w-3.5 h-3.5" />
          选手列表
        </a>
      </nav>

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Right: Dark mode toggle + Profile -->
      <div class="flex items-center gap-2">
        <!-- Mode toggle (mode-watcher style) -->
        <button
          id="header-darkmode-toggle"
          onclick={toggleMode}
          title="切换亮/暗色模式"
          class="relative w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <SunIcon
            class="h-4 w-4 scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90"
          />
          <MoonIcon
            class="absolute h-4 w-4 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0"
          />
          <span class="sr-only">Toggle theme</span>
        </button>

        <!-- Divider -->
        <div class="w-px h-5 bg-border"></div>

        <!-- Profile button -->
        <button
          id="header-profile-button"
          onclick={handleOpenDialog}
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-sm cursor-pointer group"
        >
          <div
            class="w-6 h-6 rounded-full bg-linear-to-br {avatarGradient} flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0"
          >
            {userState.id ? userState.id.slice(0, 2) : "?"}
          </div>
          <div class="hidden sm:block text-left">
            <div
              class="text-xs font-semibold text-foreground leading-tight group-hover:text-primary transition-colors"
            >
              {userState.id || "游客模式"}
            </div>
            <div class="text-[10px] text-muted-foreground leading-none">
              {userState.qqGroup ? `群: ${userState.qqGroup}` : "未登录"}
            </div>
          </div>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col">
    {#if children}
      {@render children()}
    {/if}
  </main>
</div>

<!-- Global Toaster -->
<Toaster position="bottom-right" />

<!-- Player ID Config Dialog -->
<Dialog.Root bind:open={openIdDialog}>
  <Dialog.Content
    class="{userState.id
      ? 'max-w-125'
      : 'max-w-85 sm:max-w-95'} bg-card border border-border"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
      >
        <UserRoundIcon class="w-5 h-5 text-primary" />
        {userState.id ? "完善个人资料" : "身份与加入群验证"}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if userState.id}
          修改您的游戏昵称、添加多服务器 BattleTag 及关联 Wiki。
        {:else}
          输入您所在的 SUCK 战队 QQ 水友群号 and 游戏昵称
          ID，以解锁创建、报名和修改权限。
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if userState.id}
      <!-- Logged-in profile editor -->
      <div class="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
        <!-- QQ Group & Player ID -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label
              for="layout-qq-input"
              class="text-xs font-bold text-muted-foreground">QQ 群号</label
            >
            <Input
              id="layout-qq-input"
              bind:value={qqInput}
              class="text-xs h-8 bg-background border-border text-foreground"
            />
            {#if qqError}
              <p class="text-[9px] text-destructive font-medium animate-pulse">
                {qqError}
              </p>
            {/if}
          </div>
          <div class="space-y-1">
            <label
              for="player-id-input"
              class="text-xs font-bold text-muted-foreground"
              >选手游戏昵称 / ID</label
            >
            <Input
              id="player-id-input"
              bind:value={idInput}
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
        </div>

        <!-- BattleTags -->
        <div class="space-y-2">
          <span class="text-xs font-bold text-muted-foreground"
            >游戏 BattleTags</span
          >
          <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/20 border border-border/60 p-3 rounded-xl"
          >
            <!-- CN Server -->
            <div class="space-y-2">
              <span
                class="text-[11px] font-bold text-muted-foreground flex items-center justify-between"
              >
                <span>中国服务器 (CN)</span>
                <span class="text-[10px] text-muted-foreground/60 font-normal"
                  >已添加 {editBattleTags.cn.length} 个</span
                >
              </span>

              <div
                class="flex flex-wrap gap-1 min-h-7.5 p-1.5 rounded-lg border border-border bg-background/50"
              >
                {#each editBattleTags.cn as tag, idx}
                  <Badge
                    variant="secondary"
                    class="text-[9px] font-mono py-0.5 px-1.5 bg-muted border border-border/80 text-foreground flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onclick={() =>
                        (editBattleTags.cn = editBattleTags.cn.filter(
                          (_, i) => i !== idx,
                        ))}
                      class="text-muted-foreground hover:text-destructive font-bold text-xs shrink-0 cursor-pointer"
                      >&times;</button
                    >
                  </Badge>
                {/each}
                {#if editBattleTags.cn.length === 0}
                  <span
                    class="text-[10px] text-muted-foreground/50 italic self-center px-1"
                    >暂无账号</span
                  >
                {/if}
              </div>

              <div class="flex gap-1">
                <Input
                  type="text"
                  placeholder="例如: Bnet#1234"
                  id="layout-add-cn-input"
                  class="text-xs h-7 bg-background border-border text-foreground flex-1 px-2"
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = e.currentTarget.value.trim();
                      if (val && !editBattleTags.cn.includes(val)) {
                        editBattleTags.cn = [...editBattleTags.cn, val];
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  class="w-7 h-7 border-border shrink-0 cursor-pointer"
                  onclick={() => {
                    const input = document.getElementById(
                      "layout-add-cn-input",
                    );
                    const val = input.value.trim();
                    if (val && !editBattleTags.cn.includes(val)) {
                      editBattleTags.cn = [...editBattleTags.cn, val];
                      input.value = "";
                    }
                  }}
                >
                  <PlusIcon class="w-3 h-3" />
                </Button>
              </div>
            </div>

            <!-- Global Server -->
            <div class="space-y-2">
              <span
                class="text-[11px] font-bold text-muted-foreground flex items-center justify-between"
              >
                <span>国际服务器 (Global)</span>
                <span class="text-[10px] text-muted-foreground/60 font-normal"
                  >已添加 {editBattleTags.global.length} 个</span
                >
              </span>

              <div
                class="flex flex-wrap gap-1 min-h-7.5 p-1.5 rounded-lg border border-border bg-background/50"
              >
                {#each editBattleTags.global as tag, idx}
                  <Badge
                    variant="secondary"
                    class="text-[9px] font-mono py-0.5 px-1.5 bg-muted border border-border/80 text-foreground flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onclick={() =>
                        (editBattleTags.global = editBattleTags.global.filter(
                          (_, i) => i !== idx,
                        ))}
                      class="text-muted-foreground hover:text-destructive font-bold text-xs shrink-0 cursor-pointer"
                      >&times;</button
                    >
                  </Badge>
                {/each}
                {#if editBattleTags.global.length === 0}
                  <span
                    class="text-[10px] text-muted-foreground/50 italic self-center px-1"
                    >暂无账号</span
                  >
                {/if}
              </div>

              <div class="flex gap-1">
                <Input
                  type="text"
                  placeholder="例如: Bnet#9012"
                  id="layout-add-global-input"
                  class="text-xs h-7 bg-background border-border text-foreground flex-1 px-2"
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = e.currentTarget.value.trim();
                      if (val && !editBattleTags.global.includes(val)) {
                        editBattleTags.global = [...editBattleTags.global, val];
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  class="w-7 h-7 border-border shrink-0 cursor-pointer"
                  onclick={() => {
                    const input = document.getElementById(
                      "layout-add-global-input",
                    );
                    const val = input.value.trim();
                    if (val && !editBattleTags.global.includes(val)) {
                      editBattleTags.global = [...editBattleTags.global, val];
                      input.value = "";
                    }
                  }}
                >
                  <PlusIcon class="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Flag + Team -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label
              for="edit-flag"
              class="text-xs font-bold text-muted-foreground">国籍 (Flag)</label
            >
            <Input
              id="edit-flag"
              bind:value={editFlag}
              placeholder="cn / hk / tw"
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
          <div class="space-y-1">
            <label
              for="edit-team"
              class="text-xs font-bold text-muted-foreground">战队</label
            >
            <Input
              id="edit-team"
              bind:value={editTeam}
              placeholder="战队缩写"
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
        </div>

        <!-- Wiki Link -->
        <div class="space-y-1">
          <label for="edit-link" class="text-xs font-bold text-muted-foreground"
            >Wiki 页面名称</label
          >
          <Input
            id="edit-link"
            bind:value={editLink}
            placeholder="例如: User:Bnet"
            class="text-xs h-8 bg-background border-border text-foreground"
          />
          <p class="text-[10px] text-muted-foreground/60">
            Liquipedia Wiki 页面名称，最终将链接至
            https://liquipedia.net/starcraft2/&lt;名称&gt;
          </p>
        </div>

        <!-- Battle.net IDs (Read-only) -->
        <div class="space-y-2 pt-2 border-t border-border/60">
          <span class="text-xs font-bold text-muted-foreground block"
            >自动解析的游戏账号 (只读，来自录像上传)</span
          >
          <div
            class="flex flex-wrap gap-1 min-h-9 p-1.5 rounded-lg border border-border bg-muted/10"
          >
            {#each editBnetIds as b}
              <Badge
                variant="secondary"
                class="text-[9px] font-mono bg-muted/65 border border-border/60 px-1.5 py-0.5"
              >
                {#if b.url}
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:underline">{b.id} ↗</a
                  >
                {:else}
                  {b.id}
                {/if}
              </Badge>
            {/each}
            {#if editBnetIds.length === 0}
              <span
                class="text-[10px] text-muted-foreground/50 italic self-center px-1"
                >暂无关联的游戏账号</span
              >
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- Guest verification inputs -->
      <div class="space-y-4 py-2">
        <div class="space-y-1.5">
          <label
            for="layout-qq-input"
            class="text-xs font-semibold text-muted-foreground"
            >群验证 QQ 群号</label
          >
          <Input
            id="layout-qq-input"
            bind:value={qqInput}
            placeholder="请输入 SUCK 任意群号"
            class="bg-background border-border text-foreground"
          />
          {#if qqError}
            <p class="text-[10px] text-destructive font-medium animate-pulse">
              {qqError}
            </p>
          {/if}
        </div>

        <div class="space-y-1.5">
          <label
            for="player-id-input"
            class="text-xs font-medium text-muted-foreground"
            >选手游戏昵称 / ID</label
          >
          <Input
            id="player-id-input"
            bind:value={idInput}
            placeholder="例如: Bnet"
            class="bg-background border-border text-foreground"
            onkeydown={(e) => {
              if (e.key === "Enter") handleSaveId();
            }}
          />
        </div>

        {#if existingPlayers.length > 0}
          <div class="space-y-1.5">
            <span class="text-xs font-medium text-muted-foreground block"
              >快捷选择已有选手 ID：</span
            >
            <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1">
              {#each existingPlayers as p}
                <button
                  type="button"
                  onclick={() => (idInput = p.id)}
                  class="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer {idInput ===
                  p.id
                    ? 'bg-primary text-primary-foreground border-primary font-bold'
                    : 'text-foreground'}"
                >
                  {p.display_name}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      {#if userState.id || userState.qqGroup}
        <Button
          variant="destructive"
          size="sm"
          onclick={handleClearId}
          class="w-full sm:w-auto text-xs"
        >
          退出当前身份
        </Button>
      {/if}
      <div class="flex-1"></div>
      <Button
        variant="outline"
        size="sm"
        onclick={() => (openIdDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={userState.id ? handleSaveProfile : handleSaveId}
        disabled={verifying}
        class="w-full sm:w-auto text-xs font-semibold"
      >
        {#if verifying}正在保存...{:else}保存{/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
