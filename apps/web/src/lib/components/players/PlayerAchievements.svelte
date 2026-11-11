<script>
  // A player's badges (GET /players/:id/achievements, apps/api/lib/player-awards.js):
  // earned ones in colour, the rest greyed with how far along the player is.
  import { API } from "#lib/api.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import StarIcon from "@lucide/svelte/icons/star";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import MedalIcon from "@lucide/svelte/icons/medal";
  import FlagIcon from "@lucide/svelte/icons/flag";
  import LandmarkIcon from "@lucide/svelte/icons/landmark";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import FlameIcon from "@lucide/svelte/icons/flame";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";
  import AwardIcon from "@lucide/svelte/icons/award";

  let { playerId } = $props();

  const LOOK = {
    "first-title": { icon: TrophyIcon, tone: "text-amber-500 bg-amber-500/15 border-amber-500/40" },
    "three-titles": { icon: CrownIcon, tone: "text-amber-500 bg-amber-500/15 border-amber-500/40" },
    "major-title": { icon: StarIcon, tone: "text-violet-500 bg-violet-500/15 border-violet-500/40" },
    "perfect-run": { icon: ShieldCheckIcon, tone: "text-emerald-500 bg-emerald-500/15 border-emerald-500/40" },
    podiums: { icon: MedalIcon, tone: "text-orange-500 bg-orange-500/15 border-orange-500/40" },
    "events-10": { icon: FlagIcon, tone: "text-sky-500 bg-sky-500/15 border-sky-500/40" },
    "events-30": { icon: LandmarkIcon, tone: "text-sky-500 bg-sky-500/15 border-sky-500/40" },
    "matches-50": { icon: SwordsIcon, tone: "text-blue-500 bg-blue-500/15 border-blue-500/40" },
    "streak-5": { icon: FlameIcon, tone: "text-rose-500 bg-rose-500/15 border-rose-500/40" },
    "streak-10": { icon: FlameIcon, tone: "text-rose-500 bg-rose-500/15 border-rose-500/40" },
    "giant-killer": { icon: ZapIcon, tone: "text-fuchsia-500 bg-fuchsia-500/15 border-fuchsia-500/40" },
    iron: { icon: CalendarCheckIcon, tone: "text-teal-500 bg-teal-500/15 border-teal-500/40" },
  };

  let data = $state(null);
  $effect(() => {
    const id = playerId;
    data = null;
    API.getAchievements(id)
      .then((res) => {
        if (id === playerId) data = res;
      })
      .catch(() => {});
  });
  // Earned first, then the closest to done.
  let list = $derived(
    [...(data?.achievements || [])].sort((a, b) => Number(b.earned) - Number(a.earned) || b.value / b.target - a.value / a.target),
  );
</script>

{#if data}
  <Card.Root class="border-border bg-card/40">
    <Card.Header class="p-5 pb-2">
      <Card.Title class="flex items-center gap-1.5 text-sm font-bold">
        <AwardIcon class="h-4 w-4 text-brand-ink" />成就
        <span class="num text-xs font-semibold text-muted-foreground">{data.earned} / {data.total}</span>
      </Card.Title>
    </Card.Header>
    <Card.Content class="p-5 pt-1">
      <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {#each list as a (a.id)}
          {@const look = LOOK[a.id] || { icon: AwardIcon, tone: "text-brand-ink bg-primary/15 border-primary/40" }}
          <li
            class="flex items-start gap-2 rounded-lg border p-2 {a.earned ? 'border-border bg-background/50' : 'border-dashed border-border/70 bg-muted/10'}"
            title={a.desc}
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border {a.earned ? look.tone : 'border-border bg-muted/40 text-muted-foreground/50'}">
              <look.icon class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-bold {a.earned ? '' : 'text-muted-foreground'}">{a.title}</span>
              <span class="block text-small leading-snug text-muted-foreground">{a.desc}</span>
              {#if !a.earned && a.target > 1}
                <span class="mt-1 flex items-center gap-1.5">
                  <span class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <span class="block h-full rounded-full bg-primary/60" style="width: {Math.round((a.value / a.target) * 100)}%"></span>
                  </span>
                  <span class="num text-small text-muted-foreground">{a.value}/{a.target}</span>
                </span>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    </Card.Content>
  </Card.Root>
{/if}
