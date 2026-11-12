<script>
  // The 排行 section: the ladder (MMR), the season points, the season's
  // Top 20 and the hall of fame are tabs of one section, each its own page
  // (/ladder, /points, /top, /hall) so old links keep working. Phones get
  // the short labels. 赛季总览 (/season) is a link at the end on wider screens. Same tab look as the statistics page.
  import { page } from "$app/state";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import AwardIcon from "@lucide/svelte/icons/award";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import LandmarkIcon from "@lucide/svelte/icons/landmark";
  import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";

  const TABS = [
    { href: "/ladder", label: "天梯 MMR", short: "天梯", icon: SwordsIcon },
    { href: "/points", label: "年度积分榜", short: "积分", icon: AwardIcon },
    { href: "/top", label: "年度 Top20", short: "Top20", icon: CrownIcon },
    { href: "/hall", label: "名人堂", short: "名人堂", icon: LandmarkIcon },
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
      <t.icon class="h-4 w-4" /><span class="sm:hidden">{t.short}</span><span class="hidden sm:inline">{t.label}</span>
    </a>
  {/each}
  <a href="/season" class="ml-auto hidden items-center gap-1 self-center rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/60 hover:text-brand-ink sm:inline-flex">
    <CalendarRangeIcon class="h-3.5 w-3.5" />赛季总览
  </a>
</nav>
