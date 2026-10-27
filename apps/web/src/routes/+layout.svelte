<script>
  import "../app.css";
  import { onMount } from "svelte";
  import { Toaster, toast } from "svelte-sonner";
  import { userState } from "$lib/user.svelte.js";
  import { API } from "$lib/api.js";
  import { isRecentlySeen } from "$lib/players.js";
  import { i18n, initLocale, toggleLocale } from "$lib/i18n/locale.svelte.js";
  import {
    buildContact,
    contactIsEmpty,
    parseContact,
    splitContactInput,
  } from "$lib/contact.js";
  import { page } from "$app/stores";
  import { ModeWatcher, toggleMode } from "mode-watcher";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Flag from "$lib/components/Flag.svelte";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UsersIcon from "@lucide/svelte/icons/users";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import AwardIcon from "@lucide/svelte/icons/award";
  import BellIcon from "@lucide/svelte/icons/bell";
  import BellOffIcon from "@lucide/svelte/icons/bell-off";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

  let { children } = $props();

  let openIdDialog = $state(false);
  let idInput = $state("");
  let existingPlayers = $state([]);
  let showInactiveExisting = $state(false);
  let activeExistingPlayers = $derived(
    existingPlayers.filter((p) => isRecentlySeen(p.last_seen_at)),
  );
  let inactiveExistingPlayers = $derived(
    existingPlayers.filter((p) => !isRecentlySeen(p.last_seen_at)),
  );
  let contactInput = $state("");
  let contactError = $state("");
  let verifying = $state(false);
  let pushEnabled = $state(false);
  let pushBusy = $state(false);
  let openAdminDialog = $state(false);
  let adminTokenInput = $state("");
  let adminBusy = $state(false);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function refreshPushState() {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      pushEnabled = false;
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      pushEnabled = !!subscription;
      // Make sure the backend still has this subscription after a DB reset.
      if (subscription) {
        await API.subscribePush(subscription.toJSON()).catch(() => {});
      }
    } catch (e) {
      pushEnabled = false;
    }
  }

  async function togglePush() {
    if (pushBusy) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      toast.error("当前浏览器不支持比赛提醒");
      return;
    }
    pushBusy = true;
    try {
      if (pushEnabled) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await API.unsubscribePush(subscription.endpoint).catch(() => {});
          await subscription.unsubscribe();
        }
        pushEnabled = false;
        toast.info("已关闭比赛提醒");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("通知权限被拒绝，请在浏览器设置里允许通知");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await API.getPushPublicKey();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await API.subscribePush(subscription.toJSON());
      pushEnabled = true;
      toast.success("比赛提醒已开启，开赛前 1 小时会通知你");
    } catch (e) {
      toast.error("开启比赛提醒失败: " + e.message);
    } finally {
      pushBusy = false;
    }
  }

  // Admin token handling
  function handleOpenAdminDialog() {
    adminTokenInput = "";
    openAdminDialog = true;
  }

  async function handleAdminLogin() {
    const token = adminTokenInput.trim();
    if (!token) {
      toast.error("请输入管理员令牌");
      return;
    }
    adminBusy = true;
    try {
      userState.setAdminToken(token);
      await API.verifyAdmin();
      toast.success("管理员登录成功");
      openAdminDialog = false;
      adminTokenInput = "";
    } catch (err) {
      userState.setAdminToken("");
      if (err.status === 401) {
        toast.error("管理员登录失败: 令牌不正确");
      } else if (err.status === 503) {
        toast.error("管理员登录失败: 服务器未配置 ADMIN_TOKEN");
      } else {
        toast.error("管理员登录失败: " + err.message);
      }
    } finally {
      adminBusy = false;
    }
  }

  function handleAdminLogout() {
    userState.setAdminToken("");
    adminTokenInput = "";
    openAdminDialog = false;
    toast.success("已退出管理员");
  }

  // Profile fields state
  let editFlag = $state("cn");
  let editTeam = $state("");
  let editLink = $state("");
  let editContactBase = $state({}); // untouched battle_tags keys kept across saves
  let editQQ = $state("");
  let editDiscord = $state("");
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
    initLocale();
    if (userState.id) {
      API.touchPlayer(userState.id).catch((e) => {
        console.warn("touch player failed:", e);
      });
      checkProfileCompleteness(userState.id);
    }
    if (userState.adminToken) {
      API.verifyAdmin().catch(() => userState.setAdminToken(""));
    }
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => refreshPushState())
        .catch((e) => console.warn("service worker registration failed:", e));
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
        const contact = parseContact(player.battle_tags);
        if (contactIsEmpty(contact)) {
          toast.warning("您的 QQ / Discord 联系方式尚未填写，可能会影响赛事联系。", {
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
    contactInput = userState.qqGroup || "";
    contactError = "";
    openIdDialog = true;

    if (userState.id) {
      try {
        const p = await API.getPlayer(userState.id);
        if (p) {
          editFlag = p.flag || "cn";
          editTeam = p.team || "";
          editLink = p.link || "";

          const contact = parseContact(p.battle_tags);
          editContactBase = contact.base;
          editQQ = contact.qq;
          editDiscord = contact.discord;
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

  // Fills the join field with the contact already on file for a player.
  function prefillContactFromPlayer(player) {
    const contact = parseContact(player?.battle_tags);
    contactInput = contact.qq || contact.discord || "";
  }

  // Writes the contact typed at sign-in onto the player profile. Only the
  // channel that was typed is replaced, so an existing QQ or Discord value
  // is never wiped by the other one.
  async function saveSignInContact(playerId, rawContact) {
    const parsed = splitContactInput(rawContact);
    if (!parsed.qq && !parsed.discord) return;

    let player = existingPlayers.find((p) => p.id === playerId);
    if (!player) {
      try {
        player = await API.getPlayer(playerId);
      } catch (_) {
        player = null;
      }
    }

    const current = parseContact(player?.battle_tags);
    const nextQQ = parsed.qq || current.qq;
    const nextDiscord = parsed.discord || current.discord;
    if (nextQQ === current.qq && nextDiscord === current.discord) return;

    await API.updatePlayer(playerId, {
      flag: player?.flag || "cn",
      team: player?.team || "",
      link: player?.link || "",
      battle_tags: buildContact(current.base, {
        qq: nextQQ,
        discord: nextDiscord,
      }),
    });
  }

  async function handleSaveId() {
    const trimmedContact = contactInput.trim();
    const trimmedId = idInput.trim();
    if (!trimmedContact) {
      contactError = "请输入 QQ 号或 Discord 用户名";
      return;
    }
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    verifying = true;
    contactError = "";
    try {
      const res = await API.verifyQQ(trimmedContact);
      if (res.valid) {
        userState.setQQGroup(trimmedContact);
        userState.setId(trimmedId);
        try {
          await API.touchPlayer(trimmedId);
        } catch (e) {
          console.warn("touch player failed:", e);
        }
        try {
          await saveSignInContact(trimmedId, trimmedContact);
        } catch (e) {
          console.warn("保存联系方式失败:", e);
        }
        openIdDialog = false;
        toast.success("身份配置已保存并激活权限！");
        checkProfileCompleteness(trimmedId);
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        contactError = "验证未通过，请检查 QQ 号或 Discord 用户名";
        toast.error("身份验证失败！");
      }
    } catch (err) {
      contactError = "验证请求发生错误，请稍后重试";
      toast.error("网络错误，请稍后重试");
      console.error(err);
    } finally {
      verifying = false;
    }
  }

  async function handleSaveProfile() {
    const trimmedId = idInput.trim();
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    // 1. Handle Player ID rename ("两边一起改")
    const oldId = userState.id;
    if (trimmedId !== oldId) {
      if (!userState.adminToken) {
        toast.error("修改选手 ID 需要管理员权限，请先点击右上角盾牌图标登录");
        return;
      }
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

    // 2. Save profile details
    verifying = true;
    try {
      await API.updatePlayer(trimmedId, {
        flag: editFlag || "cn",
        team: editTeam || "",
        link: editLink || "",
        battle_tags: buildContact(editContactBase, {
          qq: editQQ,
          discord: editDiscord,
        }),
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
    contactInput = "";
    openIdDialog = false;
    toast.success("已退出身份，目前为只读查看模式");
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }
</script>

<svelte:head>
  <title>Potato Cup</title>
</svelte:head>

<ModeWatcher defaultMode="dark" />

{#if $page.url.pathname.includes('/overlay')}
  {#if children}
    {@render children()}
  {/if}
{:else}
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
          <!-- Light / dark versions of the logo, switched with the colour mode. -->
          <img src="/Potato_Cup_2026_icon_lightmode.png" alt="Potato Cup" class="w-7 h-7 object-contain group-hover:scale-105 transition-transform dark:hidden" />
          <img src="/Potato_Cup_2026_icon_darkmode.png" alt="Potato Cup" class="hidden w-7 h-7 object-contain group-hover:scale-105 transition-transform dark:block" />
          <span
            class="hidden sm:inline font-bold text-sm sm:text-base tracking-tight text-foreground group-hover:text-primary transition-colors"
          >
            WarThunder
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
            title="赛事大厅"
            class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
              {$page.url.pathname === '/'
              ? 'text-primary font-semibold bg-primary/8'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <TrophyIcon class="w-3.5 h-3.5" />
            <span class="hidden md:inline">赛事大厅</span>
          </a>
          <a
            href="/players"
            title="选手列表"
            class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
              {$page.url.pathname === '/players'
              ? 'text-primary font-semibold bg-primary/8'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <UsersIcon class="w-3.5 h-3.5" />
            <span class="hidden md:inline">选手列表</span>
          </a>
          <a
            href="/stats"
            title="数据统计"
            class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
              {$page.url.pathname === '/stats'
              ? 'text-primary font-semibold bg-primary/8'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <TrendingUpIcon class="w-3.5 h-3.5" />
            <span class="hidden md:inline">数据统计</span>
          </a>
          <a
            href="/ladder"
            title="天梯"
            class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
              {$page.url.pathname === '/ladder'
              ? 'text-primary font-semibold bg-primary/8'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <SwordsIcon class="w-3.5 h-3.5" />
            <span class="hidden md:inline">天梯</span>
          </a>
          <a
            href="/points"
            title="年度积分榜"
            class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
              {$page.url.pathname === '/points'
              ? 'text-primary font-semibold bg-primary/8'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <AwardIcon class="w-3.5 h-3.5" />
            <span class="hidden md:inline">年度积分榜</span>
          </a>
          <a
            href="/pools"
            title="载具池"
            class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
              {$page.url.pathname === '/pools'
              ? 'text-primary font-semibold bg-primary/8'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <PlaneIcon class="w-3.5 h-3.5" />
            <span class="hidden md:inline">载具池</span>
          </a>
        </nav>

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Right: Notifications + Dark mode + Profile -->
        <div class="flex items-center gap-2">
          <!-- Match reminder toggle -->
          <button
            id="header-push-toggle"
            onclick={togglePush}
            disabled={pushBusy}
            title={pushEnabled ? "关闭比赛提醒" : "开启比赛提醒（开赛前 1 小时）"}
            aria-label={pushEnabled ? "关闭比赛提醒" : "开启比赛提醒"}
            class="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:opacity-50
              {pushEnabled
                ? 'text-primary bg-primary/10 hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            {#if pushEnabled}
              <BellIcon class="h-4 w-4" />
            {:else}
              <BellOffIcon class="h-4 w-4" />
            {/if}
          </button>

          <!-- Language toggle: 中文 / English -->
          <button
            id="header-language-toggle"
            type="button"
            onclick={toggleLocale}
            data-no-i18n
            title={i18n.locale === "en" ? "切换到中文" : "Switch to English"}
            aria-label={i18n.locale === "en" ? "切换到中文" : "Switch to English"}
            class="h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            {i18n.locale === "en" ? "中" : "EN"}
          </button>

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

          <!-- Admin login -->
          <button
            id="header-admin-button"
            onclick={handleOpenAdminDialog}
            title={userState.adminToken
              ? "管理员已登录（点击管理）"
              : "管理员登录"}
            aria-label="管理员登录"
            class="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer
              {userState.adminToken
                ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
          >
            <ShieldCheckIcon class="h-4 w-4" />
          </button>

          <!-- Divider -->
          <div class="w-px h-5 bg-border"></div>

          <!-- Profile button -->
          <button
            id="header-profile-button"
            onclick={handleOpenDialog}
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-sm cursor-pointer group"
          >
            <div data-no-i18n
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
                {userState.qqGroup ? `联系: ${userState.qqGroup}` : "未登录"}
              </div>
            </div>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full flex flex-col min-w-0">
      {#if children}
        {@render children()}
      {/if}
    </main>
  </div>
{/if}

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
        {userState.id ? "完善个人资料" : "身份与联系方式验证"}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if userState.id}
          修改您的游戏昵称、QQ / Discord 联系方式及关联 Wiki。
        {:else}
          填写您的 QQ 号或 Discord 用户名（联系方式）与游戏昵称 ID，以解锁创建、报名和修改权限。
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if userState.id}
      <!-- Logged-in profile editor -->
      <div class="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
        <!-- Player ID -->
        <div class="space-y-1">
          <label
            for="player-id-input"
            class="text-xs font-bold text-muted-foreground"
            >选手游戏昵称 / ID</label
          >
          <Input
            id="player-id-input"
            bind:value={idInput}
            disabled={!!userState.id && !userState.adminToken}
            class="text-xs h-8 bg-background border-border text-foreground"
          />
          {#if userState.id && !userState.adminToken}
            <p class="text-[9px] text-muted-foreground/70">
              修改选手 ID 需要管理员权限；普通用户只能维护资料。
            </p>
          {/if}
        </div>

        <!-- Contact (QQ / Discord) -->
        <div class="space-y-2">
          <span class="text-xs font-bold text-muted-foreground"
            >联系方式（QQ / Discord）</span
          >
          <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/20 border border-border/60 p-3 rounded-xl"
          >
            <div class="space-y-1">
              <label
                for="layout-contact-qq"
                class="text-[11px] font-bold text-muted-foreground">QQ 号</label
              >
              <Input
                id="layout-contact-qq"
                bind:value={editQQ}
                placeholder="例如: 123456789"
                class="text-xs h-8 bg-background border-border text-foreground"
              />
            </div>
            <div class="space-y-1">
              <label
                for="layout-contact-discord"
                class="text-[11px] font-bold text-muted-foreground"
                >Discord 用户名</label
              >
              <Input
                id="layout-contact-discord"
                bind:value={editDiscord}
                placeholder="例如: username"
                class="text-xs h-8 bg-background border-border text-foreground"
              />
            </div>
          </div>
          <p class="text-[10px] text-muted-foreground/60">
            赛务联系用，会显示在选手列表中。
          </p>
        </div>

        <!-- Flag + Team -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label
              for="edit-flag"
              class="text-xs font-bold text-muted-foreground">国籍 (Flag)</label
            >
            <div class="flex items-center gap-2">
              <Flag code={editFlag} size={20} />
              <Input
                id="edit-flag"
                bind:value={editFlag}
                placeholder="cn / hk / tw"
                class="text-xs h-8 bg-background border-border text-foreground flex-1"
              />
            </div>
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
            https://liquipedia.net/warthunder/&lt;名称&gt;
          </p>
        </div>

        <!-- Battle.net IDs (Read-only) -->
        <div class="space-y-2 pt-2 border-t border-border/60">
          <span class="text-xs font-bold text-muted-foreground block"
            >已关联的游戏账号 (只读)</span
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
            for="layout-contact-input"
            class="text-xs font-semibold text-muted-foreground"
            >QQ 号 / Discord 用户名</label
          >
          <Input
            id="layout-contact-input"
            bind:value={contactInput}
            placeholder="例如: 123456789 或 username"
            class="bg-background border-border text-foreground"
            onkeydown={(e) => {
              if (e.key === "Enter") handleSaveId();
            }}
          />
          <p class="text-[10px] text-muted-foreground/70">
            纯数字视为 QQ 号，其余视为 Discord 用户名；会写入选手资料的联系方式。
          </p>
          {#if contactError}
            <p class="text-[10px] text-destructive font-medium animate-pulse">
              {contactError}
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
              >快捷选择最近一年活跃的选手 ID：</span
            >
            <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1">
              {#each activeExistingPlayers as p}
                <button
                  type="button"
                  onclick={() => {
                    idInput = p.id;
                    prefillContactFromPlayer(p);
                  }}
                  title={p.last_seen_at ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}` : "无登录记录"}
                  class="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer {idInput ===
                  p.id
                    ? 'bg-primary text-primary-foreground border-primary font-bold'
                    : 'text-foreground'}"
                >
                  {p.display_name}
                </button>
              {:else}
                <span class="text-[10px] text-muted-foreground/60 italic px-1">
                  暂无最近一年活跃的选手
                </span>
              {/each}
            </div>
            {#if inactiveExistingPlayers.length > 0}
              <details
                class="mt-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5"
                bind:open={showInactiveExisting}
              >
                <summary
                  class="text-[10px] text-muted-foreground cursor-pointer select-none"
                >
                  显示一年未登录的选手（{inactiveExistingPlayers.length}）
                </summary>
                <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1 mt-1.5">
                  {#each inactiveExistingPlayers as p}
                    <button
                      type="button"
                      onclick={() => {
                        idInput = p.id;
                        prefillContactFromPlayer(p);
                      }}
                      title={p.last_seen_at ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}` : "无登录记录"}
                      class="text-[11px] px-2 py-0.5 rounded bg-muted/70 hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer {idInput ===
                      p.id
                        ? 'bg-primary text-primary-foreground border-primary font-bold'
                        : 'text-muted-foreground'}"
                    >
                      {p.display_name}
                    </button>
                  {/each}
                </div>
              </details>
            {/if}
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

<!-- Admin Token Dialog -->
<Dialog.Root bind:open={openAdminDialog}>
  <Dialog.Content class="max-w-85 sm:max-w-95 bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
      >
        <ShieldCheckIcon class="w-5 h-5 text-primary" />
        管理员权限
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if userState.adminToken}
          当前标签页已保存管理员令牌，可执行删除、批量导入、重解析等破坏性操作。
        {:else}
          输入服务器 .env 中配置的 ADMIN_TOKEN，以解锁删除、批量导入、重解析等破坏性操作。令牌只保存在本标签页。
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if !userState.adminToken}
      <div class="space-y-1.5 py-1">
        <label
          for="admin-token-input"
          class="text-xs font-bold text-muted-foreground">管理员令牌</label
        >
        <Input
          id="admin-token-input"
          type="password"
          bind:value={adminTokenInput}
          placeholder="ADMIN_TOKEN"
          autocomplete="off"
          class="text-xs h-8 bg-background border-border text-foreground"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdminLogin();
            }
          }}
        />
        <p class="text-[10px] text-muted-foreground/60">
          令牌由部署者在 <code>apps/api/.env</code> 的 ADMIN_TOKEN 中设置。
        </p>
      </div>
    {/if}

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      {#if userState.adminToken}
        <Button
          variant="destructive"
          size="sm"
          onclick={handleAdminLogout}
          class="w-full sm:w-auto text-xs"
        >
          退出管理员
        </Button>
      {/if}
      <div class="flex-1"></div>
      <Button
        variant="outline"
        size="sm"
        onclick={() => (openAdminDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        关闭
      </Button>
      {#if !userState.adminToken}
        <Button
          size="sm"
          onclick={handleAdminLogin}
          disabled={adminBusy}
          class="w-full sm:w-auto text-xs font-semibold"
        >
          {#if adminBusy}正在验证...{:else}登录{/if}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
