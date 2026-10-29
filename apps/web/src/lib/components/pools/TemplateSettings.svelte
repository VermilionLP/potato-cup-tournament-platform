<script>
  // A template's settings: name, event type, order, game modes and Ban /
  // Pick rules (editable by admins), or a summary for everyone else.
  import { rulesSummary } from "$lib/banpick.js";
  import { GAME_MODES, POOL_TAG, VEHICLE_POOLS } from "$lib/tournament.js";
  import { modesLabel } from "$lib/vehicle-pools.js";

  let { current, isAdmin = false, onfield, onrule, ontogglemode } = $props();

  // Removal limits: "" = unlimited, else 0-20.
  const limitValue = (n) => (n === null || n === undefined ? "" : String(n));
  const parseLimit = (value) => (value === "" ? null : Math.max(0, Math.min(20, Math.round(Number(value)) || 0)));
  const fieldInput = "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-60";
</script>

{#if isAdmin}
  <div class="grid gap-3 sm:grid-cols-2">
    <label class="space-y-1 text-xs">
      <span class="font-semibold text-foreground">模板名称</span>
      <input class="{fieldInput} w-full" maxlength="40" value={current.name} oninput={(e) => onfield("name", e.currentTarget.value)} placeholder="例如：AB 螺旋桨" />
    </label>
    <div class="grid grid-cols-[1fr_6rem] gap-2">
      <label class="space-y-1 text-xs">
        <span class="font-semibold text-foreground">比赛类型</span>
        <select class="{fieldInput} w-full cursor-pointer" value={current.event_type} onchange={(e) => onfield("event_type", e.currentTarget.value)}>
          {#each VEHICLE_POOLS as type (type.id)}
            <option value={type.id}>{type.name}</option>
          {/each}
        </select>
      </label>
      <label class="space-y-1 text-xs" title="同类型有多个模板都匹配时，数字小的优先">
        <span class="font-semibold text-foreground">排序</span>
        <input class="{fieldInput} w-full font-mono" type="number" min="0" max="9999" value={current.sort_order} oninput={(e) => onfield("sort_order", e.currentTarget.value)} />
      </label>
    </div>
    <div class="space-y-1 text-xs">
      <span class="font-semibold text-foreground">适用游戏模式</span>
      <div class="flex flex-wrap items-center gap-3">
        {#each GAME_MODES as mode (mode.id)}
          <label class="inline-flex items-center gap-1.5 cursor-pointer" title={mode.name}>
            <input type="checkbox" class="cursor-pointer" checked={current.game_modes.includes(mode.id)} onchange={() => ontogglemode(mode.id)} />
            <span class="font-mono font-semibold">{mode.code}</span>
          </label>
        {/each}
        <span class="text-muted-foreground">{current.game_modes.length ? "" : "都不勾选 = 全部模式"}</span>
      </div>
    </div>
    <div class="space-y-1 text-xs">
      <span class="font-semibold text-foreground">Ban / Pick 规则</span>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label class="inline-flex items-center gap-1.5">
          每人禁
          <select class="{fieldInput} h-7 cursor-pointer" value={String(current.rules.bansPerPlayer)} onchange={(e) => onrule("bansPerPlayer", Number(e.currentTarget.value))}>
            {#each [0, 1, 2, 3] as n (n)}<option value={String(n)}>{n}</option>{/each}
          </select>
          组
        </label>
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" class="cursor-pointer" checked={current.rules.drawVehicle} onchange={(e) => onrule("drawVehicle", e.currentTarget.checked)} />
          抽完大组再抽具体载具
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label class="inline-flex items-center gap-1.5" title="留空 = 不限次数（可随时重抽）">
          大组可移出
          <input class="{fieldInput} h-7 w-14 font-mono" type="number" min="0" max="20" placeholder="不限" value={limitValue(current.rules.groupRerolls)} oninput={(e) => onrule("groupRerolls", parseLimit(e.currentTarget.value))} />
          次
        </label>
        {#if current.rules.drawVehicle}
          <label class="inline-flex items-center gap-1.5" title="留空 = 不限次数（可随时重抽）">
            载具可移出
            <input class="{fieldInput} h-7 w-14 font-mono" type="number" min="0" max="20" placeholder="不限" value={limitValue(current.rules.vehicleRerolls)} oninput={(e) => onrule("vehicleRerolls", parseLimit(e.currentTarget.value))} />
            次
          </label>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="space-y-1 text-xs">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-base font-bold text-foreground">{current.name}</span>
      <span class="rounded-md border px-2 py-0.5 font-semibold {POOL_TAG[current.event_type] || 'border-border'}">{VEHICLE_POOLS.find((t) => t.id === current.event_type)?.name || current.event_type}</span>
      <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono font-semibold text-muted-foreground">{modesLabel(current.game_modes)}</span>
    </div>
    <p class="text-muted-foreground">Ban / Pick：{rulesSummary(current.rules)}</p>
  </div>
{/if}
