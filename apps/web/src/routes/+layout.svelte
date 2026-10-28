<script>
  // Site shell: header (navigation, reminders, language, colour mode, admin
  // and profile buttons) around every page except the OBS overlay. The
  // dialogs and header parts live in $lib/components/layout.
  import "../app.css";
  import { onMount } from "svelte";
  import { Toaster, toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { ModeWatcher, toggleMode } from "mode-watcher";
  import { userState } from "$lib/user.svelte.js";
  import { API } from "$lib/api.js";
  import { i18n, initLocale, toggleLocale } from "$lib/i18n/locale.svelte.js";
  import { contactIsEmpty, parseContact } from "$lib/contact.js";
  import { ensurePlayerKey, notifyKeyConflict } from "$lib/player-session.js";
  import SiteNav from "$lib/components/layout/SiteNav.svelte";
  import PushToggle from "$lib/components/layout/PushToggle.svelte";
  import AdminDialog from "$lib/components/layout/AdminDialog.svelte";
  import ProfileDialog from "$lib/components/layout/ProfileDialog.svelte";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

  let { children } = $props();

  let profileDialog = $state(null);
  let adminOpen = $state(false);
  const openProfileDialog = () => profileDialog?.openDialog();

  // Avatar gradient derived from the player ID.
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
    for (let i = 0; i < userState.id.length; i++) sum += userState.id.charCodeAt(i);
    return avatarColors[sum % avatarColors.length];
  });

  // Signed-in players without a contact are asked to add one.
  async function checkProfileCompleteness(playerId) {
    try {
      const player = await API.getPlayer(playerId);
      if (player && contactIsEmpty(parseContact(player.battle_tags))) {
        toast.warning("还没有填写 QQ / Discord 联系方式，报名和投票前需要先填写。", {
          action: { label: "立即完善", onClick: openProfileDialog },
          duration: 10000,
        });
      }
    } catch (e) {
      console.error("检查个人资料完整性失败:", e);
    }
  }

  onMount(() => {
    initLocale();
    if (userState.id) {
      const id = userState.id;
      API.touchPlayer(id)
        .catch((e) => console.warn("touch player failed:", e))
        .finally(() => ensurePlayerKey(id));
      checkProfileCompleteness(id);
    }
    window.addEventListener("player-key-required", notifyKeyConflict);
    if (userState.adminToken) {
      API.verifyAdmin().catch(() => userState.setAdminToken(""));
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("service worker registration failed:", e));
    }
    return () => window.removeEventListener("player-key-required", notifyKeyConflict);
  });
</script>

<svelte:head>
  <title>Potato Cup</title>
</svelte:head>

<ModeWatcher defaultMode="dark" />

{#if page.url.pathname.includes('/overlay')}
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

        <SiteNav />

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Right: Notifications + Dark mode + Profile -->
        <div class="flex items-center gap-2">
          <PushToggle />

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
            onclick={() => (adminOpen = true)}
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
            onclick={openProfileDialog}
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

<ProfileDialog bind:this={profileDialog} />
<AdminDialog bind:open={adminOpen} />
