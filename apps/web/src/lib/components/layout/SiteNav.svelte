<script>
  // Main navigation: in the site header on wide screens, a bottom tab bar
  // on phones (with short labels).
  import { page } from "$app/state";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import AwardIcon from "@lucide/svelte/icons/award";
  import PlaneIcon from "@lucide/svelte/icons/plane";
  import BugIcon from "@lucide/svelte/icons/bug";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import { userState } from "#lib/user.svelte.js";

  // placement: "top" (in the header, wide screens) or "bottom" (phones).
  let { placement = "top" } = $props();

  const LINKS = [
    { href: "/", label: "赛事大厅", short: "赛事", icon: TrophyIcon },
    { href: "/players", label: "选手列表", short: "选手", icon: UsersIcon },
    { href: "/stats", label: "数据统计", short: "统计", icon: TrendingUpIcon },
    { href: "/ladder", label: "天梯", icon: SwordsIcon },
    { href: "/points", label: "年度积分榜", short: "积分榜", icon: AwardIcon },
    { href: "/hall", label: "名人堂", icon: CrownIcon },
    { href: "/pools", label: "载具池", icon: PlaneIcon },
  ];
  // Admins also see the front-end error reports.
  // A section stays highlighted on its sub-pages (/player/x under 选手).
  const active = (href) => (href === "/" ? page.url.pathname === "/" || page.url.pathname.startsWith("/tournament") : page.url.pathname === href || page.url.pathname.startsWith(href + "/"));
  let links = $derived(userState.adminToken ? [...LINKS, { href: "/errors", label: "报错", icon: BugIcon }] : LINKS);
</script>

{#if placement === "top"}
<!-- Wide screens: in the header. -->
<nav class="hidden md:flex items-center gap-0.5" aria-label="主导航">
  {#each links as link (link.href)}
    <a
      href={link.href}
      title={link.label}
      class="flex items-center gap-1 px-2 lg:px-3 h-8 rounded-md text-sm font-medium transition-colors shrink-0 whitespace-nowrap
        {active(link.href)
        ? 'text-primary font-semibold bg-primary/8'
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
    {#each links as link (link.href)}
      <a
        href={link.href}
        class="flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors
          {active(link.href) ? 'text-primary' : 'text-muted-foreground'}"
      >
        <link.icon class="w-5 h-5" />
        <span class="max-w-full truncate px-0.5">{link.short || link.label}</span>
      </a>
    {/each}
  </div>
</nav>
{/if}
