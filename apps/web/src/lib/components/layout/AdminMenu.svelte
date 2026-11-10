<script>
  // The header's shield. Signed out: opens the admin sign-in (AdminDialog).
  // Signed in: a menu with the admin tools in one place: the match-day
  // console of each running / upcoming event, the vehicle pool templates,
  // the admin operation log, the error reports, and the admin settings (sign out).
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import MonitorPlayIcon from "@lucide/svelte/icons/monitor-play";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import BugIcon from "@lucide/svelte/icons/bug";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  let { onadmin } = $props();
  let open = $state(false);
  let events = $state(null);

  // Events with a console worth opening: running first, then registration.
  const ORDER = { in_progress: 0, registration: 1, voting: 2 };
  async function loadEvents() {
    try {
      const list = await API.listTournaments();
      events = (list || [])
        .filter((t) => t.status in ORDER)
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.scheduled_time || "").localeCompare(String(b.scheduled_time || "")))
        .slice(0, 5);
    } catch {
      events = [];
    }
  }
  $effect(() => {
    if (open && events === null) loadEvents();
  });
  const STATUS = { in_progress: "进行中", registration: "报名中", voting: "投票中" };
  const item = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer";
</script>

{#snippet shield()}
  <ShieldCheckIcon class="h-4 w-4" />
{/snippet}

{#if userState.adminToken}
  <Popover.Root bind:open>
    <Popover.Trigger
      id="header-admin-button"
      title="管理"
      aria-label="管理"
      class="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15"
    >
      {@render shield()}
    </Popover.Trigger>
    <Popover.Content align="end" class="w-72 gap-1 p-1.5">
      <p class="label-caps px-2 pt-1 text-muted-foreground">比赛日控制台</p>
      {#if events === null}
        <p class="px-2 py-1.5 text-small text-muted-foreground">加载中…</p>
      {:else if !events.length}
        <p class="px-2 py-1.5 text-small text-muted-foreground">没有进行中或即将开始的赛事。</p>
      {:else}
        {#each events as t (t.id)}
          <a href="/tournament/{t.id}/console" class={item} onclick={() => (open = false)}>
            <MonitorPlayIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate">{t.name}</span>
            <span class="shrink-0 text-small {t.status === 'in_progress' ? 'font-bold text-brand-ink' : 'text-muted-foreground'}">{STATUS[t.status]}</span>
          </a>
        {/each}
      {/if}
      <div class="my-1 h-px bg-border"></div>
      <a href="/pools" class={item} onclick={() => (open = false)}><PlaneIcon class="h-4 w-4 text-muted-foreground" />载具池模板</a>
      <a href="/log" class={item} onclick={() => (open = false)}><HistoryIcon class="h-4 w-4 text-muted-foreground" />操作记录</a>
      <a href="/errors" class={item} onclick={() => (open = false)}><BugIcon class="h-4 w-4 text-muted-foreground" />报错记录</a>
      <div class="my-1 h-px bg-border"></div>
      <button type="button" class="{item} w-full text-left" onclick={() => ((open = false), onadmin())}>
        <SettingsIcon class="h-4 w-4 text-muted-foreground" />管理员设置 / 退出
      </button>
    </Popover.Content>
  </Popover.Root>
{:else}
  <button
    id="header-admin-button"
    onclick={onadmin}
    title="管理员登录"
    aria-label="管理员登录"
    class="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/60"
  >
    {@render shield()}
  </button>
{/if}
