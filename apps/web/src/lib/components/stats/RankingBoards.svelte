<script>
  // Career boards (名人堂): titles and runner-ups (with counts per tier),
  // win rate (5+ matches), matches played and walkovers, each a LeaderBoard.
  import { TAG_BASE, TAG_TONE } from "#lib/tags.js";
  import { TIER_TAG, tierBreakdown } from "#lib/tournament.js";
  import LeaderBoard from "./LeaderBoard.svelte";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import MedalIcon from "@lucide/svelte/icons/medal";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";

  // `class`: the boards' layout (a grid in 名人堂).
  let { rankings, class: layout = "grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3" } = $props();

  const tierTags = (byTier) =>
    tierBreakdown(byTier).map((t) => ({ text: `${t.id === "none" ? "未分级" : t.id} ×${t.count}`, class: `${TAG_BASE} ${TIER_TAG[t.id] || TAG_TONE.neutral}` }));
  const base = (p) => ({ id: p.id, name: p.display_name, flag: p.flag });

  let boards = $derived([
    {
      key: "titles",
      title: "最强战力榜（冠军次数）",
      icon: TrophyIcon,
      tone: "text-amber-500",
      empty: "暂无冠军记录",
      rows: (rankings.by_championships || []).map((p) => ({ ...base(p), value: p.championships, unit: "次", tags: tierTags(p.championships_by_tier) })),
    },
    {
      key: "runner-ups",
      title: "苦涩的他~（亚军次数）",
      icon: MedalIcon,
      tone: "text-slate-500 dark:text-slate-300",
      empty: "暂无亚军记录",
      rows: (rankings.by_runner_ups || []).map((p) => ({ ...base(p), value: p.runner_ups, unit: "次", tags: tierTags(p.runner_ups_by_tier) })),
    },
    {
      key: "win-rate",
      title: "胜率榜（至少 5 场）",
      icon: TrendingUpIcon,
      tone: "text-emerald-600 dark:text-emerald-400",
      empty: "暂无胜率排行（至少 5 场）",
      rows: (rankings.by_win_rate || []).map((p) => ({ ...base(p), value: `${Math.round(p.match_win_rate * 100)}%`, note: `${p.matches_won} / ${p.matches_played}` })),
    },
    {
      key: "played",
      title: "劳模战士榜（场数）",
      icon: ActivityIcon,
      tone: "text-blue-600 dark:text-blue-400",
      empty: "暂无场数排行",
      rows: (rankings.by_played || []).map((p) => ({ ...base(p), value: p.matches_played, unit: "场" })),
    },
    {
      key: "walkovers",
      title: "和平鸽子王（弃权）",
      icon: ShieldAlertIcon,
      tone: "text-sky-600 dark:text-sky-400",
      empty: "暂无弃权排行",
      rows: (rankings.by_walkover || []).map((p) => ({ ...base(p), value: p.walkover_losses, unit: "次" })),
    },
  ]);
</script>

<div class={layout}>
  {#each boards as b (b.key)}
    <LeaderBoard title={b.title} icon={b.icon} tone={b.tone} rows={b.rows} empty={b.empty} />
  {/each}
</div>
