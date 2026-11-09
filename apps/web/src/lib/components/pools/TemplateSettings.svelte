<script>
  // A template's settings in two panels, basics (name, event type, order,
  // game modes) and Ban / Pick rules, editable by admins; a summary for
  // everyone else.
  import { rulesSummary } from "#lib/banpick.js";
  import { GAME_MODES, POOL_TAG, VEHICLE_POOLS } from "#lib/tournament.js";
  import { modesLabel } from "#lib/vehicle-pools.js";

  let { current, isAdmin = false, onfield, onrule, ontogglemode } = $props();

  // Removal limits: "" = unlimited, else 0-20.
  const limitValue = (n) => (n === null || n === undefined ? "" : String(n));
  const parseLimit = (value) => (value === "" ? null : Math.max(0, Math.min(20, Math.round(Number(value)) || 0)));
  const fieldInput = "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-60";
</script>

{#if isAdmin}
  <div class="grid gap-3 lg:grid-cols-2">
    <!-- Basics -->
    <section class="space-y-3 rounded-lg border border-border/60 bg-background/60 p-3.5">
      <h3 class="label-caps text-muted-foreground">基本设置</h3>
      <label class="block space-y-1 text-xs">
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
          <input class="{fieldInput} w-full num" type="number" min="0" max="9999" value={current.sort_order} oninput={(e) => onfield("sort_order", e.currentTarget.value)} />
        </label>
      </div>
      <div class="space-y-1 text-xs">
        <span class="font-semibold text-foreground">适用游戏模式</span>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-md border border-border p-0.5">
            {#each GAME_MODES as mode (mode.id)}
              {@const on = current.game_modes.includes(mode.id)}
              <button
                type="button"
                aria-pressed={on}
                title={mode.name}
                onclick={() => ontogglemode(mode.id)}
                class="h-7 min-w-11 rounded px-2.5 num text-xs font-bold transition-colors cursor-pointer {on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
              >
                {mode.code}
              </button>
            {/each}
          </div>
          <span class="text-small text-muted-foreground">{current.game_modes.length ? "" : "都不选 = 全部模式"}</span>
        </div>
      </div>
    </section>

    <!-- Ban / Pick rules -->
    <section class="space-y-3 rounded-lg border border-border/60 bg-background/60 p-3.5">
      <h3 class="label-caps text-muted-foreground">Ban / Pick 规则</h3>
      <div class="flex items-center justify-between gap-3 text-xs">
        <span class="font-semibold text-foreground">每人禁用</span>
        <div class="inline-flex items-center gap-2">
          <div class="inline-flex rounded-md border border-border p-0.5">
            {#each [0, 1, 2, 3] as n (n)}
              <button
                type="button"
                aria-pressed={current.rules.bansPerPlayer === n}
                onclick={() => onrule("bansPerPlayer", n)}
                class="h-7 w-8 rounded num text-xs font-bold transition-colors cursor-pointer {current.rules.bansPerPlayer === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
              >
                {n}
              </button>
            {/each}
          </div>
          <span class="text-muted-foreground">组</span>
        </div>
      </div>
      <label class="flex cursor-pointer items-center justify-between gap-3 text-xs">
        <span>
          <span class="block font-semibold text-foreground">抽完大组再抽具体载具</span>
          <span class="text-small text-muted-foreground">关闭时只抽到大组，组内载具任选</span>
        </span>
        <span class="relative inline-flex h-5 w-9 shrink-0 items-center">
          <input type="checkbox" class="peer sr-only" checked={current.rules.drawVehicle} onchange={(e) => onrule("drawVehicle", e.currentTarget.checked)} />
          <span class="absolute inset-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"></span>
          <span class="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
        </span>
      </label>
      <div class="grid gap-2 text-xs sm:grid-cols-2">
        <label class="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5" title="留空 = 不限次数（可随时重抽）">
          <span class="font-semibold text-foreground">大组可移出</span>
          <span class="inline-flex items-center gap-1.5 text-muted-foreground">
            <input class="{fieldInput} h-7 w-14 text-center num" type="number" min="0" max="20" placeholder="不限" value={limitValue(current.rules.groupRerolls)} oninput={(e) => onrule("groupRerolls", parseLimit(e.currentTarget.value))} />
            次
          </span>
        </label>
        {#if current.rules.drawVehicle}
          <label class="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5" title="留空 = 不限次数（可随时重抽）">
            <span class="font-semibold text-foreground">载具可移出</span>
            <span class="inline-flex items-center gap-1.5 text-muted-foreground">
              <input class="{fieldInput} h-7 w-14 text-center num" type="number" min="0" max="20" placeholder="不限" value={limitValue(current.rules.vehicleRerolls)} oninput={(e) => onrule("vehicleRerolls", parseLimit(e.currentTarget.value))} />
              次
            </span>
          </label>
        {/if}
      </div>
      <p class="border-t border-border/50 pt-2 text-small text-muted-foreground">{rulesSummary(current.rules)}</p>
    </section>
  </div>
{:else}
  <div class="space-y-1 text-xs">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-base font-bold text-foreground">{current.name}</span>
      <span class="rounded-md border px-2 py-0.5 font-semibold {POOL_TAG[current.event_type] || 'border-border'}">{VEHICLE_POOLS.find((t) => t.id === current.event_type)?.name || current.event_type}</span>
      <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 num font-semibold text-muted-foreground">{modesLabel(current.game_modes)}</span>
    </div>
    <p class="text-muted-foreground">Ban / Pick：{rulesSummary(current.rules)}</p>
  </div>
{/if}
