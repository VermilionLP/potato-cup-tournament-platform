<script>
  // The admins' back office: the panel (pending matches, alerts, backups),
  // the admin log, browser errors and the vehicle pool templates are tabs of
  // one section, each its own page (/admin, /log, /errors, /pools) so old
  // links keep working. Same look as the 排行 tabs; phones get short labels.
  import { page } from "$app/state";
  import { adminPending } from "#lib/admin-pending.svelte.js";
  import GaugeIcon from "@lucide/svelte/icons/gauge";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import BugIcon from "@lucide/svelte/icons/bug";
  import PlaneIcon from "@lucide/svelte/icons/plane";

  const TABS = [
    { href: "/admin", label: "待处理与备份", short: "概览", icon: GaugeIcon },
    { href: "/log", label: "操作记录", short: "记录", icon: HistoryIcon },
    { href: "/errors", label: "前端报错", short: "报错", icon: BugIcon },
    { href: "/pools", label: "载具池模板", short: "载具池", icon: PlaneIcon },
  ];
  let pending = $derived(adminPending.items.length);
</script>

<nav class="flex gap-1 border-b border-border" aria-label="管理">
  {#each TABS as t (t.href)}
    {@const on = page.url.pathname === t.href}
    <a
      href={t.href}
      aria-current={on ? "page" : undefined}
      class="-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-sm font-semibold transition-colors sm:px-3
        {on ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
    >
      <t.icon class="h-4 w-4" /><span class="sm:hidden">{t.short}</span><span class="hidden sm:inline">{t.label}</span>
      {#if t.href === "/admin" && pending}
        <span class="num flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-label font-bold leading-none text-white">{pending}</span>
      {/if}
    </a>
  {/each}
</nav>
