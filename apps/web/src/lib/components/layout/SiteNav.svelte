<script>
  // Main navigation: in the site header on wide screens, a bottom tab bar
  // on phones (with short labels).
  import { page } from "$app/state";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";

  // placement: "top" (in the header, wide screens) or "bottom" (phones).
  let { placement = "top" } = $props();

  // Four sections. 排行 holds the ladder, the season points and the 年度 Top20 (tabs,
  // RankingTabs) and the hall of fame; 数据 the statistics and vehicles. Admin
  // tools (console, vehicle pools, error reports) are in the shield menu.
  // `match`: the paths that keep a section highlighted.
  // Phones show 我的 instead of 选手 (the player list is a link on 我的 and
  // in the search); wide screens have both (我的 from lg up, where it fits).
  const LINKS = [
    { href: "/", label: "赛事大厅", short: "赛事", icon: TrophyIcon, match: ["/tournament"] },
    { href: "/players", label: "选手", icon: UsersIcon, match: ["/player"] },
    { href: "/ladder", label: "排行", icon: SwordsIcon, match: ["/points", "/top", "/hall", "/season"] },
    { href: "/stats", label: "数据", icon: TrendingUpIcon, match: [] },
    { href: "/me", label: "我的", icon: UserRoundIcon, match: [], narrow: true },
  ];
  const TOP = LINKS;
  // Phones: 赛事 · 排行 · 数据 · 我的.
  const BOTTOM = [LINKS[0], LINKS[2], LINKS[3], LINKS[4]];
  const under = (path, base) => path === base || path.startsWith(base + "/");
  const active = (link) => {
    const path = page.url.pathname;
    return (link.href === "/" ? path === "/" : under(path, link.href)) || link.match.some((m) => under(path, m));
  };
</script>

{#if placement === "top"}
<!-- Wide screens: in the header. -->
<nav class="hidden md:flex items-center gap-0.5" aria-label="主导航">
  {#each TOP as link (link.href)}
    <a
      href={link.href}
      title={link.label}
      class="flex items-center gap-1 px-2 lg:px-3 h-8 rounded-md text-sm font-medium transition-colors shrink-0 whitespace-nowrap {link.narrow ? 'md:hidden lg:flex' : ''}
        {active(link)
        ? 'text-brand-ink font-semibold bg-primary/8'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
    >
      <link.icon class="w-3.5 h-3.5" />
      <span>{link.label}</span>
    </a>
  {/each}
</nav>

{:else}
<!-- Phones: a tab bar at the bottom of the screen (the header has no room).
     Rendered outside the header: its backdrop blur would make `fixed`
     relative to the header instead of the screen. -->
<nav
  class="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
  aria-label="主导航"
>
  <div class="flex">
    {#each BOTTOM as link (link.href)}
      <a
        href={link.href}
        class="flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1.5 text-small font-medium transition-colors
          {active(link) ? 'text-brand-ink' : 'text-muted-foreground'}"
      >
        <link.icon class="w-5 h-5" />
        <span class="max-w-full truncate px-0.5">{link.short || link.label}</span>
      </a>
    {/each}
  </div>
</nav>
{/if}
