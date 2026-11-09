<script>
  // Site shell: header (navigation, reminders, language, colour mode, admin
  // and profile buttons) around every page except the OBS overlay. The
  // dialogs and header parts live in #lib/components/layout.
  import "../app.css";
  import { onMount } from "svelte";
  import { Toaster, toast } from "svelte-sonner";
  import { page } from "$app/state";
  import { ModeWatcher, mode, toggleMode } from "mode-watcher";
  import { userState } from "#lib/user.svelte.js";
  import { API } from "#lib/api.js";
  import { i18n, initLocale, toggleLocale } from "#lib/i18n/locale.svelte.js";
  import { contactIsEmpty, parseContact } from "#lib/contact.js";
  import { ensurePlayerKey, notifyKeyConflict } from "#lib/player-session.js";
  import SiteNav from "#lib/components/layout/SiteNav.svelte";
  import PushToggle from "#lib/components/layout/PushToggle.svelte";
  import AdminDialog from "#lib/components/layout/AdminDialog.svelte";
  import ConfirmHost from "#lib/components/layout/ConfirmHost.svelte";
  import { installErrorReporting } from "#lib/error-report.js";
  import ProfileDialog from "#lib/components/layout/ProfileDialog.svelte";
  import SiteFooter from "#lib/components/layout/SiteFooter.svelte";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

  let { children } = $props();

  let profileDialog = $state(null);
  let adminOpen = $state(false);
  const openProfileDialog = () => profileDialog?.openDialog();

  // Avatar gradient derived from the player ID.
  const avatarColors = [
    "from-orange-500 to-amber-600",
    "from-sky-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-red-600",
    "from-slate-500 to-slate-700",
    "from-amber-500 to-orange-600",
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
    // Uncaught errors go to the API for admins (/errors).
    const stopReporting = installErrorReporting((r) => API.reportClientError(r));
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
    return () => {
      stopReporting();
      window.removeEventListener("player-key-required", notifyKeyConflict);
    };
  });
</script>

<svelte:head>
  <title>Potato Cup</title>
</svelte:head>

<ModeWatcher defaultMode="light" />

{#if page.url.pathname.includes('/overlay')}
  {#if children}
    {@render children()}
  {/if}
{:else}
  <div
    class="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30"
  >
    <!-- Top Bar: a dark bar in both colour modes, for the white wordmark.
         The `dark` class gives everything inside it the dark tokens. -->
    <header
      class="dark sticky top-0 z-40 w-full border-b border-white/5 bg-header text-foreground"
    >
      <div
        class="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2 sm:gap-6"
      >
        <!-- Left: Logo (the POTATO CUP wordmark; the icon on phones) -->
        <a href="/" class="flex items-center shrink-0" aria-label="Potato Cup">
          <img src="/logo-dark-64.png" width="28" height="28" alt="Potato Cup" class="w-7 h-7 object-contain sm:hidden" />
          <img src="/logo-wordmark-64.webp" width="129" height="32" alt="Potato Cup" class="hidden sm:block h-8 w-auto" />
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
            class="h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-small font-bold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
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
            <!-- The header is always dark, so the icon follows the page's
                 mode (mode.current) rather than the dark: variant. -->
            <SunIcon
              class="h-4 w-4 transition-all duration-300 {mode.current === 'dark' ? 'scale-0 -rotate-90' : 'scale-100 rotate-0'}"
            />
            <MoonIcon
              class="absolute h-4 w-4 transition-all duration-300 {mode.current === 'dark' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'}"
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
              class="w-6 h-6 rounded-full bg-linear-to-br {avatarGradient} flex items-center justify-center text-label font-bold text-white uppercase shrink-0"
            >
              {userState.id ? userState.id.slice(0, 2) : "?"}
            </div>
            <div class="hidden sm:block text-left">
              <div
                class="text-xs font-semibold text-foreground leading-tight group-hover:text-brand-ink transition-colors"
              >
                {userState.id || "游客模式"}
              </div>
              <div class="text-small text-muted-foreground leading-none">
                {userState.qqGroup ? `联系: ${userState.qqGroup}` : "未登录"}
              </div>
            </div>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <!-- pb on phones: room for the bottom tab bar (SiteNav). -->
    <main class="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full flex flex-col min-w-0">
      {#if children}
        {@render children()}
      {/if}
    </main>
    <SiteFooter />
  </div>
{/if}

<!-- Global Toaster -->
{#if !page.url.pathname.includes("/overlay")}<SiteNav placement="bottom" />{/if}
<Toaster position="bottom-right" mobileOffset={{ bottom: "76px" }} />
<ConfirmHost />

<ProfileDialog bind:this={profileDialog} />
<AdminDialog bind:open={adminOpen} />
