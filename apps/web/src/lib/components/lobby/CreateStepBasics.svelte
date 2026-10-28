<script>
  // Create-event wizard, step 1: name, capacity, mode, type and time.
  import { GAME_MODES, VEHICLE_POOLS } from "$lib/tournament.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import DateTimePicker from "$lib/components/DateTimePicker.svelte";
  import Segmented from "./Segmented.svelte";

  let { form = $bindable() } = $props();
</script>

<section class="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
  <div class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">基本信息</div>
  <div class="space-y-1.5">
    <label for="create-name-input" class="text-xs font-semibold text-foreground/80">赛事名称</label>
    <Input id="create-name-input" bind:value={form.name} placeholder="例如 Potato Cup Weekly #40" class="bg-background border-border text-foreground" />
  </div>
  <div class="grid grid-cols-[6.5rem_1fr] gap-3">
    <div class="space-y-1.5">
      <label for="create-capacity-input" class="text-xs font-semibold text-foreground/80">人数上限</label>
      <Input id="create-capacity-input" type="number" bind:value={form.capacity} min="2" max="128" class="bg-background border-border text-foreground" />
    </div>
    <div class="space-y-1.5">
      <span class="text-xs font-semibold text-foreground/80">比赛模式</span>
      <Segmented
        options={GAME_MODES.map((m) => ({ id: m.id, label: m.code, sub: m.name.replace("模式", ""), title: m.full }))}
        value={form.gameMode}
        onpick={(id) => (form.gameMode = id)}
      />
    </div>
  </div>
  <div class="space-y-1.5">
    <span class="text-xs font-semibold text-foreground/80">比赛类型</span>
    <Segmented
      options={VEHICLE_POOLS.map((p) => ({ id: p.id, label: p.name, title: p.code }))}
      value={form.eventPool}
      onpick={(id) => (form.eventPool = id)}
    />
  </div>
  <div class="space-y-1.5">
    <label for="create-time-input" class="text-xs font-semibold text-foreground/80">
      比赛时间 <span class="font-normal text-muted-foreground">· 可选，设置后跳过时间投票直接开启报名</span>
    </label>
    <DateTimePicker id="create-time-input" bind:value={form.scheduledTime} placeholder="不设置（先进行时间投票）" />
  </div>
</section>
