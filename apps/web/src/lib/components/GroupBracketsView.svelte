<script>
  // Group stage played as single- or double-elimination brackets: one group
  // at a time, its placings (who qualified and how) and its bracket.
  import Flag from "$lib/components/Flag.svelte";
  import DoubleElimBracket from "$lib/components/DoubleElimBracket.svelte";

  let {
    groups = [], // group_stage.groups: [{ group, label, rows, complete }]
    matches = [], // the group-stage matches of every group
    players = [],
    format = "double_elim", // group-stage format
    perGroup = 0,
    status = "",
    activeMatchId = null,
    isAdmin = false,
    userId = "",
    banpickEnabled = false,
    onOpenMatch = () => {},
    onToggleActive = () => {},
    onBanPick = () => {},
  } = $props();

  const playerById = $derived(new Map((players || []).map((p) => [p.id, p])));
  const myGroup = $derived(
    groups.find((g) => g.rows.some((r) => r.player_id === userId))?.group ?? null,
  );
  let picked = $state(null);
  // Your own group first, otherwise A.
  const shown = $derived(picked ?? myGroup ?? groups[0]?.group ?? 1);
  const current = $derived(groups.find((g) => g.group === shown) || null);
  const groupMatches = $derived(
    (matches || []).filter((m) => (m.swiss_group || 1) === shown),
  );
  const pendingIn = (group) =>
    (matches || []).filter(
      (m) => (m.swiss_group || 1) === group && m.status === "pending" && m.player1_id && m.player2_id,
    ).length;

  function nameOf(id) {
    return playerById.get(id)?.display_name || id;
  }
</script>

{#if groups.length}
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-1.5">
      {#each groups as g (g.group)}
        {@const open = pendingIn(g.group)}
        <button
          type="button"
          onclick={() => (picked = g.group)}
          class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors cursor-pointer
            {shown === g.group
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-foreground/80 hover:border-foreground/40'}"
        >
          {g.label} 组
          {#if g.complete}
            <span class="text-[9px] font-semibold opacity-75">已结束</span>
          {:else if open}
            <span class="text-[9px] font-semibold opacity-75">{open} 场待赛</span>
          {/if}
          {#if g.group === myGroup}
            <span class="text-[9px] opacity-75">· 我</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if current}
      <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div class="space-y-1.5 rounded-xl border border-border bg-background/30 p-3 self-start">
          <div class="flex items-center justify-between text-xs font-bold text-foreground">
            <span>{current.label} 组名次</span>
            <span class="text-[10px] font-normal text-muted-foreground">前 {perGroup} 名出线</span>
          </div>
          {#each current.rows as row (row.player_id)}
            <div
              class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]
                {row.qualified ? 'bg-emerald-500/10' : ''}
                {row.player_id === userId ? 'ring-1 ring-primary/50' : ''}"
            >
              <span class="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{row.how ? row.rank : "–"}</span>
              <Flag code={playerById.get(row.player_id)?.flag} size={12} />
              <span class="min-w-0 flex-1 truncate font-semibold text-foreground">{nameOf(row.player_id)}</span>
              {#if row.qualified}
                <span class="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">出线</span>
              {:else if row.how}
                <span class="shrink-0 text-[9px] text-muted-foreground">{row.how}</span>
              {/if}
            </div>
          {/each}
          {#if !current.complete}
            <p class="pt-1 text-[10px] text-muted-foreground">小组进行中，名次随比赛结果更新。</p>
          {/if}
        </div>

        <div class="min-w-0">
          <DoubleElimBracket
            matches={groupMatches}
            {players}
            {status}
            {activeMatchId}
            {isAdmin}
            {userId}
            {banpickEnabled}
            {onOpenMatch}
            {onToggleActive}
            {onBanPick}
            {perGroup}
            wbCode={format === "single_elim" ? "gse" : "gwb"}
            lbCode="glb"
            variant={format === "single_elim" ? "group-single" : "group-double"}
          />
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="py-12 text-center text-muted-foreground">
    <p class="text-xs italic">小组对阵尚未生成。</p>
  </div>
{/if}
