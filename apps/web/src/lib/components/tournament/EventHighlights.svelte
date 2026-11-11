<script>
  // 本场看点 of a finished event (GET /tournaments/:id/highlights): the
  // biggest upset by ladder MMR, the closest match (most games, latest
  // round) and the dark horse (furthest above their seed). Hidden when the
  // event has none of the three.
  import { onMount } from "svelte";
  import { API } from "#lib/api.js";
  import { roundLabeler } from "#lib/event-view.js";
  import Flag from "#lib/components/Flag.svelte";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import RocketIcon from "@lucide/svelte/icons/rocket";

  let { tournament, playerName } = $props();

  let data = $state(null);
  onMount(async () => {
    try {
      data = await API.getHighlights(tournament.id);
    } catch {
      data = null;
    }
  });

  let label = $derived(roundLabeler(tournament));
  const matchOf = (id) => (tournament.matches || []).find((m) => m.id === id) || null;
  const flagOf = (id) => (tournament.players || []).find((p) => p.id === id)?.flag || "";
  const place = (from, to) => (to > from ? `${from}-${to}` : `${from}`);
  // Winner's score first.
  const wonScore = (u) => {
    const m = matchOf(u.match_id);
    const first = m ? m.player1_id === u.winner : true;
    return first ? `${u.score1} : ${u.score2}` : `${u.score2} : ${u.score1}`;
  };
  let any = $derived(Boolean(data && (data.upset || data.closest || data.darkHorse)));
</script>

{#snippet who(id, cls = "")}
  <a href="/player/{encodeURIComponent(id)}" class="inline-flex min-w-0 items-center gap-1 font-bold hover:text-brand-ink {cls}">
    <Flag code={flagOf(id)} size={14} />
    <span class="truncate">{playerName(id)}</span>
  </a>
{/snippet}

{#if any}
  <section class="mx-auto mt-6 max-w-2xl space-y-3" aria-label="本场看点">
    <h3 class="flex items-center gap-1.5 text-base font-bold"><SparklesIcon class="h-4 w-4 text-brand-ink" />本场看点</h3>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {#if data.upset}
        {@const u = data.upset}
        <div class="space-y-1.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <div class="flex items-center gap-1.5 text-small font-bold text-rose-600 dark:text-rose-400"><ZapIcon class="h-3.5 w-3.5" />最大爆冷</div>
          <div class="flex flex-wrap items-center gap-x-1.5 text-sm">
            {@render who(u.winner)}
            <span class="num font-black">{wonScore(u)}</span>
            {@render who(u.loser, "font-semibold text-muted-foreground")}
          </div>
          <p class="text-small text-muted-foreground">天梯分低 {u.gap} 分取胜（{u.winner_mmr} 对 {u.loser_mmr}）</p>
          <p class="flex flex-wrap gap-x-2 text-small text-muted-foreground/80"><span>{label(matchOf(u.match_id))}</span>{#if data.upsets > 1}<span>本场共 {data.upsets} 次爆冷</span>{/if}</p>
        </div>
      {/if}
      {#if data.closest}
        {@const c = data.closest}
        <div class="space-y-1.5 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
          <div class="flex items-center gap-1.5 text-small font-bold text-sky-600 dark:text-sky-400"><SwordsIcon class="h-3.5 w-3.5" />最胶着的对决</div>
          <div class="flex flex-wrap items-center gap-x-1.5 text-sm">
            {@render who(c.player1)}
            <span class="num font-black">{c.score1} : {c.score2}</span>
            {@render who(c.player2)}
          </div>
          <p class="text-small text-muted-foreground">打满 {c.games} 局，只差 1 局</p>
          <p class="text-small text-muted-foreground/80">{label(matchOf(c.match_id))}</p>
        </div>
      {/if}
      {#if data.darkHorse}
        {@const d = data.darkHorse}
        <div class="space-y-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div class="flex items-center gap-1.5 text-small font-bold text-emerald-600 dark:text-emerald-400"><RocketIcon class="h-3.5 w-3.5" />黑马</div>
          <div class="text-sm">{@render who(d.id)}</div>
          <p class="text-small text-muted-foreground">{d.seed} 号种子，拿到第 {place(d.place, d.place_to)} 名</p>
          <p class="text-small text-muted-foreground/80">比种子排位高 {d.gain} 位</p>
        </div>
      {/if}
    </div>
  </section>
{/if}
