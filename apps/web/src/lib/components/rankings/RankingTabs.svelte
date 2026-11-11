<script>
  // The 排行 section: the ladder (MMR), the season points and the season's
  // Top 20 are tabs of one section, each its own page (/ladder, /points,
  // /top) so old links keep working. Same tab look as the statistics page.
  import { page } from "$app/state";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import AwardIcon from "@lucide/svelte/icons/award";
  import CrownIcon from "@lucide/svelte/icons/crown";

  const TABS = [
    { href: "/ladder", label: "天梯 MMR", icon: SwordsIcon },
    { href: "/points", label: "年度积分榜", icon: AwardIcon },
    { href: "/top", label: "年度 Top20", icon: CrownIcon },
  ];
</script>

<nav class="flex gap-1 border-b border-border" aria-label="排行">
  {#each TABS as t (t.href)}
    {@const on = page.url.pathname === t.href}
    <a
      href={t.href}
      aria-current={on ? "page" : undefined}
      class="-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-sm sm:px-3 font-semibold transition-colors
        {on ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
    >
      <t.icon class="h-4 w-4" />{t.label}
    </a>
  {/each}
</nav>
