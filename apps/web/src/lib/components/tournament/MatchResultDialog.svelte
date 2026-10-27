<script>
  // Reporting (or, for admins, correcting) a match: Ban / Pick first when it
  // is on, then the score form.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import BanPickPanel from "$lib/components/BanPickPanel.svelte";
  import ScoreForm from "$lib/components/ScoreForm.svelte";
  import { canConfirm, confirmResult } from "$lib/banpick.js";

  let {
    open = $bindable(false),
    step = $bindable("banpick"),
    bp = $bindable(),
    score1 = $bindable(0),
    score2 = $bindable(0),
    match = null,
    tournament,
    correcting = false,
    banpickEnabled = false,
    bpMatchId = null,
    vehicles = [],
    poolName = "",
    submitting = false,
    roundLabel,
    recordedLabel,
    playerName,
    onwalkover,
    onrollback,
    onsubmit,
  } = $props();

  const player = (id) => {
    const p = tournament?.players?.find((x) => x.id === id);
    return { id, name: playerName(id), flag: p?.flag, seed: p?.seed };
  };
  let showBanPick = $derived(step === "banpick" && banpickEnabled && !correcting);

  function submit() {
    onsubmit(Number(score1) > Number(score2) ? match.player1_id : match.player2_id);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="{showBanPick ? '!max-w-4xl' : '!max-w-xl'} w-full max-h-[90vh] overflow-y-auto bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground">
        {#if correcting}
          <div class="mb-1">修正比赛结果</div>
        {:else if step === "banpick" && banpickEnabled}
          <div class="flex flex-wrap items-center gap-2 mb-1 pr-6">
            <span>Ban / Pick</span>
            {#if bp.phase === "done"}
              <Button size="sm" onclick={() => (step = "score")}>填报比分 →</Button>
            {:else}
              <Button
                size="sm"
                disabled={!canConfirm(bp)}
                onclick={() => (bp = confirmResult(bp))}
                title={canConfirm(bp) ? "锁定本场载具" : "抽到载具后才能确认"}>确认抽取结果</Button
              >
            {/if}
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2 mb-1 pr-6">
            <span>填报比分</span>
            {#if banpickEnabled && bpMatchId === match?.id && bp.phase === "done"}
              <span class="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                本场载具：{bp.vehicle}
              </span>
            {/if}
          </div>
        {/if}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        场次: {match?.position} • {match ? roundLabel(match) : ""}
      </Dialog.Description>
    </Dialog.Header>

    {#if match}
      {#if step === "banpick" && banpickEnabled}
        <div class="py-2">
          {#key match.id}
            <BanPickPanel bind:bp {vehicles} {poolName} player1={player(match.player1_id)} player2={player(match.player2_id)} />
          {/key}
        </div>
      {:else}
        <div class="py-3 space-y-4">
          {#if correcting}
            <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs space-y-1">
              <div><span class="font-bold text-amber-500">当前记录：</span>{recordedLabel(match)}</div>
              <div class="text-muted-foreground">提交后会先重置本场，再按新结果重新晋级；如果晋级选手已打过后续比赛，那些比赛也会被清空。</div>
            </div>
          {/if}
          <ScoreForm
            player1={player(match.player1_id)}
            player2={player(match.player2_id)}
            bind:score1
            bind:score2
            format={tournament?.format}
            loserAdvances={tournament?.loser_advances === 1 || tournament?.loser_advances === true}
            disabled={submitting}
            onWalkover={onwalkover}
          />
        </div>
        <Dialog.Footer class="flex gap-2">
          {#if correcting}
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onclick={onrollback}
              class="border-destructive/40 text-destructive hover:bg-destructive hover:text-white">重置为未开始</Button
            >
          {/if}
          <Button size="sm" disabled={submitting || Number(score1) === Number(score2)} onclick={submit} class="flex-1 h-9 font-bold">
            {submitting ? "提交中…" : `${correcting ? "提交修正" : "提交比分"}  ${Number(score1) || 0} : ${Number(score2) || 0}`}
          </Button>
        </Dialog.Footer>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
