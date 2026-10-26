<script>
  import Flag from "$lib/components/Flag.svelte";

  let {
    groupStage = null, // payload.group_stage
    players = [],
    playoffFormat = "single_elim",
    inPlayoffs = false,
    status = "",
    isAdmin = false,
    busy = false,
    onStart = () => {},
    onWithdraw = () => {},
  } = $props();

  const playerById = $derived(new Map((players || []).map((p) => [p.id, p])));
  const qualifiers = $derived(groupStage?.qualifiers || []);
  const warnings = $derived(groupStage?.warnings || []);
  const complete = $derived(Boolean(groupStage?.complete));
  const bracketSize = $derived(qualifiers.length ? 2 ** Math.ceil(Math.log2(Math.max(2, qualifiers.length))) : 0);
  const byes = $derived(bracketSize - qualifiers.length);

  function nameOf(id) {
    return playerById.get(id)?.display_name || id;
  }
</script>

{#if groupStage}
  <div class="space-y-2 rounded-xl border border-border bg-background/30 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-bold text-foreground">
        {playoffFormat === "double_elim" ? "双败" : "单败"}淘汰赛 · {qualifiers.length} 人晋级
      </span>
      {#if inPlayoffs}
        <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">淘汰赛进行中</span>
      {:else if complete}
        <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">小组赛已结束</span>
      {:else}
        <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">小组赛进行中 · 名单按当前排名实时变化</span>
      {/if}
      {#if byes > 0}
        <span class="text-[10px] text-muted-foreground">前 {byes} 号种子首轮轮空</span>
      {/if}
      <div class="ml-auto flex gap-1.5">
        {#if isAdmin && status === "in_progress" && !inPlayoffs}
          <button
            type="button"
            disabled={!complete || busy}
            onclick={onStart}
            title={complete ? "按以下名单和种子生成淘汰赛对阵" : "小组赛全部打完后才能进入淘汰赛"}
            class="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-45 cursor-pointer"
          >
            进入淘汰赛
          </button>
        {/if}
        {#if isAdmin && inPlayoffs && status !== "completed"}
          <button
            type="button"
            disabled={busy}
            onclick={onWithdraw}
            class="rounded-full border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive hover:text-white disabled:opacity-45 cursor-pointer"
          >
            撤回淘汰赛
          </button>
        {/if}
      </div>
    </div>

    {#if warnings.length}
      <ul class="space-y-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
        {#each warnings as w (w.group)}
          <li>⚠ {w.message}：{nameOf(w.player_in)} 晋级，{nameOf(w.player_out)} 出局</li>
        {/each}
      </ul>
    {/if}
    {#if groupStage.same_group_pairs > 0}
      <p class="text-[10px] text-muted-foreground">
        有 {groupStage.same_group_pairs} 场首轮对阵来自同一小组（同名次选手不够互换）。
      </p>
    {/if}

    <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
      {#each qualifiers as q (q.player_id)}
        <div class="flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1">
          <span class="w-6 shrink-0 font-mono text-[10px] font-bold text-primary">#{q.playoff_seed}</span>
          <Flag code={playerById.get(q.player_id)?.flag} size={12} />
          <span class="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">{nameOf(q.player_id)}</span>
          <span class="shrink-0 text-[9px] text-muted-foreground">{q.group_label}{q.group_rank}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
