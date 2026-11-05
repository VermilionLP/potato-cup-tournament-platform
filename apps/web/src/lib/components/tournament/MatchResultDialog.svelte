<script>
  // Reporting (or, for admins, correcting) a match: Ban / Pick first when it
  // is on, then the scoreboard (ScoreForm) with the ladder MMR estimate
  // (LadderPreview). While a match is played its score can be saved as a
  // live score (保存实时比分: no winner, shown on the bracket and the
  // overlay); 提交比分 records the result. Walkovers and (admins) resetting
  // a recorded match are under the scoreboard.
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import BanPickPanel from "#lib/components/BanPickPanel.svelte";
  import ScoreForm from "#lib/components/ScoreForm.svelte";
  import { canConfirm, mayAct, resultLabel } from "#lib/banpick.js";
  import { hasLiveScore } from "#lib/match-card.js";
  import PendingReportPanel from "./PendingReportPanel.svelte";
  import LadderPreview from "./LadderPreview.svelte";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import FlagIcon from "@lucide/svelte/icons/flag";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";

  let {
    open = $bindable(false),
    step = $bindable("banpick"),
    bp,
    bpRemote = null,
    score1 = $bindable(0),
    score2 = $bindable(0),
    match = null,
    tournament,
    correcting = false,
    banpickEnabled = false,
    vehicles = [],
    poolName = "",
    submitting = false,
    roundLabel,
    recordedLabel,
    playerName,
    isAdmin = false,
    viewerId = "",
    onconfirmreport,
    ondisputereport,
    onwithdrawreport,
    onwalkover,
    onrollback,
    onsubmit,
    onsavelive,
    savingLive = false,
  } = $props();

  const player = (id) => {
    const p = tournament?.players?.find((x) => x.id === id);
    return { id, name: playerName(id), flag: p?.flag, seed: p?.seed };
  };
  let showBanPick = $derived(step === "banpick" && banpickEnabled && !correcting);
  let confirmingBp = $state(false);
  async function confirmBp() {
    confirmingBp = true;
    try {
      await bpRemote.act("confirm");
    } catch {
      // shown by the page
    } finally {
      confirmingBp = false;
    }
  }

  function submit() {
    onsubmit(Number(score1) > Number(score2) ? match.player1_id : match.player2_id);
  }

  // Live scores: only for a match being played (both players, no result).
  let canSaveLive = $derived(
    !correcting && Boolean(onsavelive) && match?.status === "pending" && Boolean(match?.player1_id && match?.player2_id),
  );
  let tie = $derived(Number(score1) === Number(score2));
  let showWalkover = $state(false);
  const ago = (iso) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return min < 1 ? "刚刚" : min < 60 ? `${min} 分钟前` : `${Math.round(min / 60)} 小时前`;
  };
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="{showBanPick ? '!max-w-4xl' : '!max-w-xl'} w-full max-h-[90vh] overflow-y-auto bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground">
        {#if correcting}
          <div class="mb-1 pr-6">修正比赛结果</div>
        {:else if step === "banpick" && banpickEnabled}
          <div class="flex flex-wrap items-center gap-2 mb-1 pr-6">
            <span>Ban / Pick</span>
            {#if bp.phase === "done"}
              <Button size="sm" onclick={() => (step = "score")}>填报比分 →</Button>
            {:else if mayAct(bpRemote?.record, "confirm", bpRemote?.me, bpRemote?.myId)}
              <Button
                size="sm"
                disabled={!canConfirm(bp) || confirmingBp}
                onclick={confirmBp}
                title={canConfirm(bp) ? "锁定本场载具" : "抽到结果后才能确认"}>确认抽取结果</Button
              >
            {/if}
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2 mb-1 pr-6">
            <span>填报比分</span>
            {#if banpickEnabled && bp.phase === "done"}
              <span class="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                本场载具：{resultLabel(bp)}
              </span>
            {/if}
          </div>
        {/if}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {match ? roundLabel(match) : ""} · 第 {match?.position} 场
      </Dialog.Description>
    </Dialog.Header>

    {#if match}
      {#if step === "banpick" && banpickEnabled}
        <div class="py-2">
          {#key match.id}
            <BanPickPanel {bp} remote={bpRemote} nameOf={playerName} {vehicles} {poolName} player1={player(match.player1_id)} player2={player(match.player2_id)} />
          {/key}
        </div>
      {:else}
        <div class="space-y-3 py-2">
          <PendingReportPanel
            {match}
            {viewerId}
            {isAdmin}
            {playerName}
            busy={submitting}
            onconfirm={onconfirmreport}
            ondispute={ondisputereport}
            onwithdraw={onwithdrawreport}
          />
          {#if correcting}
            <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              <span class="font-bold text-amber-600 dark:text-amber-400">当前记录：</span>{recordedLabel(match)}
              <span class="block text-[11px] text-muted-foreground">提交修正会先重置本场再按新结果晋级；晋级选手已打过的后续比赛也会被清空。</span>
            </div>
          {:else if hasLiveScore(match)}
            <div class="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs">
              <span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500"></span>
              <span class="font-bold text-red-600 dark:text-red-400">实时比分 {match.live_score1} : {match.live_score2}</span>
              <span class="text-muted-foreground">· {ago(match.live_score_at)}保存，还没有结果</span>
            </div>
          {/if}
          <ScoreForm
            player1={player(match.player1_id)}
            player2={player(match.player2_id)}
            bind:score1
            bind:score2
            format={tournament?.format}
            loserAdvances={tournament?.loser_advances === 1 || tournament?.loser_advances === true}
            disabled={submitting || savingLive}
            liveHint={canSaveLive}
          />
          {#if !correcting && match.player1_id && match.player2_id && match.status !== "completed" && match.status !== "walkover" && !tie}
            <LadderPreview {match} {tournament} {playerName} {score1} {score2} />
          {/if}

          <!-- Other outcomes: a walkover; admins reset a recorded match -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <button type="button" onclick={() => (showWalkover = !showWalkover)} class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer">
              <FlagIcon class="h-3 w-3" />弃权判定
            </button>
            {#if correcting}
              <button type="button" disabled={submitting} onclick={onrollback} class="inline-flex items-center gap-1 text-destructive/80 hover:text-destructive cursor-pointer disabled:opacity-50">
                <RotateCcwIcon class="h-3 w-3" />重置为未开始
              </button>
            {/if}
            {#if !isAdmin && !correcting}
              <span class="text-muted-foreground/80">提交后需要对手确认（10 分钟内没有异议自动生效）；申报对手弃权需要管理员确认。</span>
            {/if}
          </div>
          {#if showWalkover}
            <div class="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-2 text-xs">
              <span class="col-span-2 text-[11px] text-muted-foreground">一方未到场或退赛，判另一方晋级：</span>
              {#each [match.player1_id, match.player2_id] as pid (pid)}
                <button
                  type="button"
                  disabled={submitting || !pid}
                  onclick={() => onwalkover(pid)}
                  class="truncate rounded-md border border-border bg-background px-2 py-1.5 font-semibold hover:border-primary/50 hover:text-primary disabled:opacity-40 cursor-pointer"
                >
                  判 {playerName(pid)} 晋级
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <Dialog.Footer class="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row">
          {#if canSaveLive}
            <Button
              size="sm"
              variant="outline"
              disabled={submitting || savingLive}
              onclick={() => onsavelive(Number(score1) || 0, Number(score2) || 0)}
              class="h-10 gap-1.5 border-red-500/40 font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400 sm:w-auto"
              title="比赛还在进行：只更新比分，不产生胜者，也不晋级"
            >
              <RadioIcon class="h-4 w-4" />
              {savingLive ? "保存中…" : `保存实时比分 ${Number(score1) || 0} : ${Number(score2) || 0}`}
            </Button>
          {/if}
          <Button size="sm" disabled={submitting || tie} onclick={submit} class="h-10 flex-1 font-bold">
            {submitting ? "提交中…" : `${correcting ? "提交修正" : "提交最终比分"}  ${Number(score1) || 0} : ${Number(score2) || 0}`}
          </Button>
        </Dialog.Footer>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
