<script>
  // The Ban / Pick guide: where the process is (numbered steps), what to do
  // now in one sentence, and the next action as one big button, with the
  // other choices of this step (redraw, remove, back, skip) beside it in
  // quieter buttons. Pinned to the top of the dialog while the groups
  // scroll. Draws go through `ondraw(kind)` (the draw strip rolls them),
  // everything else through `run(action)`; `onscore` moves on once locked.
  import { availableGroups, availableVehicles, banTurn, canConfirm, rerollsLeft, resultLabel } from "#lib/banpick.js";
  import CheckIcon from "@lucide/svelte/icons/check";
  import DicesIcon from "@lucide/svelte/icons/dices";
  import LockIcon from "@lucide/svelte/icons/lock";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";

  let { bp, grouped = [], can = () => true, busy = false, rolling = false, me = null, run, ondraw, onscore = null } = $props();

  const rules = $derived(bp.rules);
  const turn = $derived(banTurn(bp));
  const left = $derived(rerollsLeft(bp));
  const groupsLeft = $derived(availableGroups(bp, grouped));
  const vehiclesLeft = $derived(bp.group ? availableVehicles(bp, grouped, bp.group) : []);
  const freeGroupRedraw = $derived(rules.groupRerolls === null);
  const freeVehicleRedraw = $derived(rules.vehicleRerolls === null);
  const canGoBack = $derived(rules.groupRerolls === null && rules.vehicleRerolls === null);
  const off = $derived(busy || rolling);
  // Players act on their own turn; spectators only watch.
  const actor = $derived(can("drawGroup"));
  const removals = (n) => (n === null ? "" : `（剩 ${n} 次）`);

  const STEPS = $derived(
    [
      rules.bansPerPlayer > 0 && { id: "ban", label: rules.bansPerPlayer > 1 ? `禁用 ×${rules.bansPerPlayer}` : "禁用" },
      { id: "drawGroup", label: "抽大组" },
      rules.drawVehicle && { id: "drawVehicle", label: "抽载具" },
      { id: "done", label: "确认" },
    ].filter(Boolean),
  );
  // The confirm step is current once there is something to confirm.
  const current = $derived(bp.phase === "done" ? "done" : canConfirm(bp) ? "done" : bp.phase);
  const currentIndex = $derived(STEPS.findIndex((s) => s.id === current));

  // What to do now: { title, hint, primary: { label, icon, onclick, disabled, attention }, secondary: [...] }.
  let now = $derived.by(() => {
    if (bp.phase === "done") {
      return {
        title: `已锁定：${resultLabel(bp)}`,
        hint: "本场载具已确定，比赛结束后填报比分。",
        primary: onscore ? { label: "填报比分", icon: ArrowRightIcon, onclick: onscore } : null,
        secondary: [],
      };
    }
    if (bp.phase === "ban") {
      const mine = !me || me.admin || me.side === turn;
      return {
        title: `${turn} 方禁用一个大组`,
        hint: mine ? "在下方点击要禁用的大组名或其中的载具；不想禁用就空过。" : `等待 ${turn} 方禁用…`,
        primary: null,
        secondary: can("pass") ? [{ label: "本轮空过", onclick: () => run("pass") }] : [],
      };
    }
    if (bp.phase === "drawGroup") {
      if (!bp.group) {
        return {
          title: "抽取大组",
          hint: groupsLeft.length ? `从剩下的 ${groupsLeft.length} 个大组里随机抽一个。` : '没有可抽的大组了，可以点"重置"重新开始。',
          primary: { label: "抽取大组", icon: DicesIcon, onclick: () => ondraw("drawGroup"), disabled: !groupsLeft.length },
          secondary: [],
        };
      }
      const redraw = freeGroupRedraw ? [{ label: "重新抽取", onclick: () => ondraw("drawGroup"), disabled: !groupsLeft.length }] : [];
      const remove = [{ label: `移出该组${removals(left.groups)}`, onclick: () => run("removeGroup"), disabled: left.groups === 0 }];
      return rules.drawVehicle
        ? {
            title: `抽到大组：${bp.group}`,
            hint: "满意就使用该组，接着抽具体载具；不满意可以移出重抽。",
            primary: { label: "使用该组，去抽载具", icon: ArrowRightIcon, onclick: () => run("confirmGroup") },
            secondary: [...redraw, ...remove],
          }
        : {
            title: `抽到大组：${bp.group}`,
            hint: "确认后本场在该组内任选载具，结果会锁定。",
            primary: { label: "确认抽取结果", icon: LockIcon, onclick: () => run("confirm"), attention: true },
            secondary: [...redraw, ...remove],
          };
    }
    // drawVehicle
    const back = canGoBack ? [{ label: "返回大组", onclick: () => run("backToGroups") }] : [];
    if (!bp.vehicle) {
      return {
        title: `抽取 ${bp.group} 组的载具`,
        hint: vehiclesLeft.length ? `从组内剩下的 ${vehiclesLeft.length} 辆里随机抽一辆。` : `该组载具已全部移出，${canGoBack ? "请返回大组重新抽取" : '可以点"重置"重新开始'}。`,
        primary: { label: "抽取载具", icon: DicesIcon, onclick: () => ondraw("drawVehicle"), disabled: !vehiclesLeft.length },
        secondary: back,
      };
    }
    return {
      title: `抽到载具：${bp.vehicle}`,
      hint: "确认后锁定本场载具，双方就按它比赛。",
      primary: { label: "确认抽取结果", icon: LockIcon, onclick: () => run("confirm"), attention: true },
      secondary: [
        ...(freeVehicleRedraw ? [{ label: "重新抽取", onclick: () => ondraw("drawVehicle"), disabled: !vehiclesLeft.length }] : []),
        { label: `移出该载具${removals(left.vehicles)}`, onclick: () => run("removeVehicle"), disabled: left.vehicles === 0 },
        ...back,
      ],
    };
  });
  const showButtons = $derived(bp.phase === "done" || actor);
</script>

<div class="sticky top-0 z-10 -mx-1 rounded-xl border border-primary/30 bg-card/95 p-3 shadow-sm backdrop-blur sm:p-3.5">
  <!-- Steps -->
  <ol class="mb-2.5 flex items-center gap-1.5 text-small" aria-label="Ban / Pick 步骤">
    {#each STEPS as step, i (step.id)}
      {@const done = i < currentIndex || bp.phase === "done"}
      {@const active = i === currentIndex && bp.phase !== "done"}
      {#if i > 0}<li aria-hidden="true" class="h-px min-w-3 flex-1 {done || active ? 'bg-primary/50' : 'bg-border'}"></li>{/if}
      <li class="flex shrink-0 items-center gap-1 {active ? 'font-bold text-brand-ink' : done ? 'text-foreground' : 'text-muted-foreground'}" aria-current={active ? "step" : undefined}>
        <span class="inline-flex size-5 items-center justify-center rounded-full text-label font-bold {active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/15 text-brand-ink' : 'bg-muted'}">
          {#if done}<CheckIcon class="size-3" />{:else}{i + 1}{/if}
        </span>
        {step.label}
      </li>
    {/each}
  </ol>

  <!-- Now -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="min-w-0 flex-1">
      <p class="truncate text-base font-black text-foreground">{now.title}</p>
      <p class="text-small text-muted-foreground">{showButtons ? now.hint : "观战中，等待选手或管理员操作…"}</p>
    </div>
    {#if showButtons}
      <div class="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {#each now.secondary as b (b.label)}
          <button
            type="button"
            disabled={off || b.disabled}
            onclick={b.onclick}
            class="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            {b.label}
          </button>
        {/each}
        {#if now.primary}
          <button
            type="button"
            disabled={off || now.primary.disabled}
            onclick={now.primary.onclick}
            class="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 cursor-pointer
              {now.primary.attention && !off ? 'guide-attention' : ''}"
          >
            {#if now.primary.icon}{@const Icon = now.primary.icon}<Icon class="size-4" />{/if}
            {now.primary.label}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* The confirm button breathes until it is pressed. */
  .guide-attention {
    animation: guideAttention 1.6s ease-in-out infinite;
  }
  @keyframes guideAttention {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-primary) 45%, transparent);
    }
    50% {
      box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary) 0%, transparent);
    }
  }
</style>
