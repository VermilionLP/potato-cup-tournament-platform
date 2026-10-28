<script>
  // Main navigation in the site header.
  import { page } from "$app/state";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import AwardIcon from "@lucide/svelte/icons/award";
  import PlaneIcon from "@lucide/svelte/icons/plane";

  const LINKS = [
    { href: "/", label: "赛事大厅", icon: TrophyIcon },
    { href: "/players", label: "选手列表", icon: UsersIcon },
    { href: "/stats", label: "数据统计", icon: TrendingUpIcon },
    { href: "/ladder", label: "天梯", icon: SwordsIcon },
    { href: "/points", label: "年度积分榜", icon: AwardIcon },
    { href: "/pools", label: "载具池", icon: PlaneIcon },
  ];
</script>

<nav class="flex items-center gap-0.5">
  {#each LINKS as link (link.href)}
    <a
      href={link.href}
      title={link.label}
      class="flex items-center gap-1 px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap
        {page.url.pathname === link.href
        ? 'text-primary font-semibold bg-primary/8'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
    >
      <link.icon class="w-3.5 h-3.5" />
      <span class="hidden md:inline">{link.label}</span>
    </a>
  {/each}
</nav>
