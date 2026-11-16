<script>
  // 比赛地图 and 载具池模板 are tabs of one section (the 地图 item of the main
  // navigation): what an event is played on and with. Each is its own page
  // (/maps, /pools), so old links keep working. Same look as the 排行 tabs.
  import { page } from "$app/state";
  import MapIcon from "@lucide/svelte/icons/map";
  import PlaneIcon from "@lucide/svelte/icons/plane";

  const TABS = [
    { href: "/maps", label: "比赛地图", short: "地图", icon: MapIcon },
    { href: "/pools", label: "载具池模板", short: "载具池", icon: PlaneIcon },
  ];
</script>

<nav class="flex gap-1 border-b border-border" aria-label="地图与载具池">
  {#each TABS as t (t.href)}
    {@const on = page.url.pathname === t.href}
    <a
      href={t.href}
      aria-current={on ? "page" : undefined}
      class="-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-sm font-semibold transition-colors sm:px-3
        {on ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
    >
      <t.icon class="h-4 w-4" /><span class="sm:hidden">{t.short}</span><span class="hidden sm:inline">{t.label}</span>
    </a>
  {/each}
</nav>
