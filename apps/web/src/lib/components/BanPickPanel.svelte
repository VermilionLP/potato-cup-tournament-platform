<script>
  // Ban / Pick for one match, following the rules of the event's vehicle pool
  // template (bans per player, removal limits, whether a vehicle is drawn).
  // Parts: banpick/BanPickSide (a player and their bans), BanPickDrawStrip
  // (draws), BanPickGroupGrid (the groups), BanPickLog (the server's log).
  //
  // Two modes, same look:
  // - local (the template preview): `bp` is changed here (#lib/banpick.js
  //   localAct), undo steps back through this panel's own history;
  // - server (a match): `remote` = { record, me: { admin, side }, myId,
  //   act(action, args) }; every action goes to the server, which draws and
  //   keeps the log, and the page passes the new state back in as `bp`.
  //   Buttons the viewer may not use (mayAct) are hidden or disabled, so
  //   other people can watch.
  import { banTurn, groupVehicles, initialBanPick, localAct, mayAct, rulesSummary } from "#lib/banpick.js";
  import BanPickSide from "./banpick/BanPickSide.svelte";
  import BanPickDrawStrip from "./banpick/BanPickDrawStrip.svelte";
  import BanPickGroupGrid from "./banpick/BanPickGroupGrid.svelte";
  import BanPickLog from "./banpick/BanPickLog.svelte";
  import Undo2Icon from "@lucide/svelte/icons/undo-2";

  let {
    vehicles = [],
    poolName = "",
    player1 = { name: "A", flag: "" },
    player2 = { name: "B", flag: "" },
    bp = $bindable(initialBanPick()),
    remote = null,
    nameOf = (id) => id,
  } = $props();
  let rolling = $state(false);
  let busy = $state(false);
  // Local mode: earlier states, for undo.
  let history = $state([]);

  const rules = $derived(bp.rules);
  const grouped = $derived(groupVehicles(vehicles));
  const steps = $derived(
    [
      rules.bansPerPlayer > 0 && { id: "ban", label: rules.bansPerPlayer > 1 ? `禁用 ×${rules.bansPerPlayer}` : "禁用" },
      { id: "drawGroup", label: "抽大组" },
      rules.drawVehicle && { id: "drawVehicle", label: "抽载具" },
    ].filter(Boolean),
  );
  const stepIndex = $derived(bp.phase === "done" ? steps.length : steps.findIndex((s) => s.id === bp.phase));
  const vehicleCount = $derived(grouped.reduce((n, g) => n + g.vehicles.length, 0));
  const banning = $derived(bp.phase === "ban");
  const turn = $derived(banTurn(bp));

  /** May the viewer do `action` now? */
  const can = (action) => (remote ? mayAct(remote.record, action, remote.me, remote.myId) : action !== "undo" || history.length > 0);

  /** Carries out an action; resolves once the new state is in `bp` (server mode: once the page has it). */
  async function run(action, args = {}) {
    if (remote) {
      busy = true;
      try {
        await remote.act(action, args);
      } finally {
        busy = false;
      }
      return;
    }
    if (action === "undo") {
      if (history.length) bp = history.at(-1);
      history = history.slice(0, -1);
      return;
    }
    const next = localAct(bp, grouped, action, args);
    if (next === bp) return;
    history = action === "reset" ? [] : [...history.slice(-50), bp];
    bp = next;
  }
  const turnText = $derived(
    !remote || remote.me?.admin ? `轮到 ${turn} 禁用，点击大组名或载具即可禁用整组` : remote.me?.side === turn ? "轮到你禁用，点击大组名或载具即可禁用整组" : `等待 ${turn} 方禁用`,
  );
</script>

<div class="space-y-3">
  <!-- Players and their bans, with the step indicator in between -->
  <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
    <BanPickSide slot="A" player={player1} active={turn === "A"} {bp} canPass={can("pass") && !busy} onpass={() => run("pass")} />
    <ol class="flex shrink-0 items-center justify-center gap-1 px-1">
      {#each steps as step, i (step.id)}
        <li
          class="rounded-full px-2 py-0.5 text-small font-semibold
            {i === stepIndex
            ? 'bg-primary text-primary-foreground'
            : i < stepIndex
              ? 'bg-primary/15 text-brand-ink'
              : 'bg-muted text-muted-foreground'}"
        >
          {step.label}
        </li>
      {/each}
    </ol>
    <BanPickSide slot="B" player={player2} active={turn === "B"} {bp} canPass={can("pass") && !busy} onpass={() => run("pass")} />
  </div>

  <!-- Draw strip -->
  {#if !banning}
    <BanPickDrawStrip {bp} {grouped} {run} {can} {busy} lastEntry={remote?.record?.log?.at(-1) || null} bind:rolling />
  {/if}

  <!-- Vehicle groups -->
  <div class="flex items-center justify-between gap-2 text-small text-muted-foreground">
    <span>
      {poolName ? `${poolName} · ` : ""}{grouped.length} 个大组 · {vehicleCount} 架 · {rulesSummary(rules)}
      {#if banning}· {turnText}{/if}
    </span>
    <span class="flex shrink-0 items-center gap-1">
      {#if can("undo")}
        <button
          type="button"
          disabled={rolling || busy}
          onclick={() => run("undo")}
          class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
          title="撤销上一步（会记录在操作记录里）"
        >
          <Undo2Icon class="h-3 w-3" />撤销
        </button>
      {/if}
      {#if can("reset")}
        <button
          type="button"
          disabled={rolling || busy}
          onclick={() => run("reset")}
          class="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
        >
          重置
        </button>
      {/if}
    </span>
  </div>
  <BanPickGroupGrid {bp} {grouped} banning={banning && can("ban") && !busy} onban={(group, vehicle) => run("ban", { group, vehicle })} />
  {#if remote?.record?.log?.length}
    <BanPickLog log={remote.record.log} {nameOf} />
  {/if}
</div>
