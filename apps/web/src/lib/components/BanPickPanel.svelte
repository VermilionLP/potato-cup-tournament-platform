<script>
  // Ban / Pick for one match, following the rules of the event's vehicle pool
  // template (bans per player, removal limits, whether a vehicle is drawn).
  // Parts: banpick/BanPickSide (a player and their bans), BanPickGuide
  // (the steps, what to do now and its buttons, pinned on top),
  // BanPickDrawStrip (the draws), BanPickGroupGrid (the groups),
  // BanPickLog (the server's log).
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
  import BanPickGuide from "./banpick/BanPickGuide.svelte";
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
    onscore = null, // "填报比分" once the result is locked (the match dialog)
  } = $props();
  let strip = $state(null);
  let rolling = $state(false);
  let busy = $state(false);
  // Local mode: earlier states, for undo.
  let history = $state([]);

  const rules = $derived(bp.rules);
  const grouped = $derived(groupVehicles(vehicles));
  const vehicleCount = $derived(grouped.reduce((n, g) => n + g.vehicles.length, 0));
  const banning = $derived(bp.phase === "ban");
  const turn = $derived(banTurn(bp));

  /** May the viewer do `action` now? */
  // A match without a Ban / Pick yet is judged on the state shown (`bp`).
  const can = (action) => (remote ? mayAct(remote.record, action, remote.me, remote.myId, bp) : action !== "undo" || history.length > 0);

  /**
   * Carries out an action; resolves once the new state is in `bp` (server
   * mode: once the page has it) with true, or false when the server said no
   * (remote.act has shown why and refreshed the page).
   */
  async function run(action, args = {}) {
    if (remote) {
      busy = true;
      try {
        await remote.act(action, args);
        return true;
      } catch {
        return false;
      } finally {
        busy = false;
      }
    }
    if (action === "undo") {
      if (history.length) bp = history.at(-1);
      history = history.slice(0, -1);
      return true;
    }
    const next = localAct(bp, grouped, action, args);
    if (next === bp) return false;
    history = action === "reset" ? [] : [...history.slice(-50), bp];
    bp = next;
    return true;
  }
</script>

<div class="space-y-3">
  <!-- What to do now and its buttons (pinned while the groups scroll) -->
  <BanPickGuide {bp} {grouped} {can} {busy} {rolling} me={remote?.me || null} {run} ondraw={(kind) => strip?.draw(kind)} {onscore} />

  <!-- Players and their bans -->
  <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
    <BanPickSide slot="A" player={player1} active={turn === "A"} {bp} canPass={false} />
    <BanPickSide slot="B" player={player2} active={turn === "B"} {bp} canPass={false} />
  </div>

  <!-- Draw strip -->
  {#if !banning}
    <BanPickDrawStrip bind:this={strip} {bp} {grouped} {run} {can} {busy} lastEntry={remote?.record?.log?.at(-1) || null} bind:rolling />
  {/if}

  <!-- Vehicle groups -->
  <div class="flex items-center justify-between gap-2 text-small text-muted-foreground">
    <span>
      {poolName ? `${poolName} · ` : ""}{grouped.length} 个大组 · {vehicleCount} 架 · {rulesSummary(rules)}
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
