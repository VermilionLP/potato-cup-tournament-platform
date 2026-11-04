<script>
  // Ban / Pick for one match, following the rules of the event's vehicle pool
  // template (bans per player, removal limits, whether a vehicle is drawn).
  // Parts: banpick/BanPickSide (a player and their bans), BanPickDrawStrip
  // (draws), BanPickGroupGrid (the groups); the state is #lib/banpick.js.
  import { banTurn, groupVehicles, initialBanPick, rulesSummary } from "#lib/banpick.js";
  import BanPickSide from "./banpick/BanPickSide.svelte";
  import BanPickDrawStrip from "./banpick/BanPickDrawStrip.svelte";
  import BanPickGroupGrid from "./banpick/BanPickGroupGrid.svelte";

  let {
    vehicles = [],
    poolName = "",
    player1 = { name: "A", flag: "" },
    player2 = { name: "B", flag: "" },
    // Owned by the page so its header can confirm the result and so reopening
    // the same match keeps the Ban/Pick progress. Starts with the template's rules.
    bp = $bindable(initialBanPick()),
  } = $props();
  let rolling = $state(false);

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
</script>


<div class="space-y-3">
  <!-- Players and their bans, with the step indicator in between -->
  <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
    <BanPickSide slot="A" player={player1} active={turn === "A"} bind:bp />
    <ol class="flex shrink-0 items-center justify-center gap-1 px-1">
      {#each steps as step, i (step.id)}
        <li
          class="rounded-full px-2 py-0.5 text-[10px] font-semibold
            {i === stepIndex
            ? 'bg-primary text-primary-foreground'
            : i < stepIndex
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground'}"
        >
          {step.label}
        </li>
      {/each}
    </ol>
    <BanPickSide slot="B" player={player2} active={turn === "B"} bind:bp />
  </div>

  <!-- Draw strip -->
  {#if !banning}
    <BanPickDrawStrip bind:bp {grouped} bind:rolling />
  {/if}

  <!-- Vehicle groups -->
  <div class="flex items-center justify-between text-[10px] text-muted-foreground">
    <span>
      {poolName ? `${poolName} · ` : ""}{grouped.length} 个大组 · {vehicleCount} 架 · {rulesSummary(rules)}
      {#if banning}· 轮到 {turn} 禁用，点击大组名或载具即可禁用整组{/if}
    </span>
    <button
      type="button"
      disabled={rolling}
      onclick={() => (bp = initialBanPick(bp.rules))}
      class="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground cursor-pointer"
    >
      重置
    </button>
  </div>
  <BanPickGroupGrid bind:bp {grouped} {banning} />
</div>
