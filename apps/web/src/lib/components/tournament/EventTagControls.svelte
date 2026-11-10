<script>
  // An event's tier and kind, game mode and event type: read-only tags in
  // the header, or (editable, in EventSettingsDialog for admins) labelled
  // selects that save on change. The Ban / Pick template is chosen on the
  // 载具池 tab (PoolTemplatePicker).
  import { TAG_BASE, TAG_TONE } from "#lib/tags.js";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import {
    POOL_TAG,
    VEHICLE_POOLS,
    EVENT_KINDS,
    EVENT_TIERS,
    TIER_TAG,
    tierTagText,
    GAME_MODES,
    gameModeInfo,
    gameModeLabel,
    gameModeTitle,
    vehiclePoolLabel,
  } from "#lib/tournament.js";

  let { tournament = $bindable(), tid, isAdmin = false, editable = false } = $props();

  function adminOnly() {
    if (isAdmin) return true;
    toast.error("此操作需要管理员权限，请先点击右上角盾牌图标登录");
    return false;
  }

  // Event type (螺旋桨 / 早期喷气 / 顶级喷气 / Pro League BVR): admins can change it any time.
  let savingPool = $state(false);
  async function saveEventPool(pool) {
    if (!adminOnly() || !pool || pool === tournament?.vehicle_pool) return;
    savingPool = true;
    try {
      const res = await API.updateTournament(tid, { vehicle_pool: pool });
      tournament = { ...tournament, vehicle_pool: res.vehicle_pool };
      toast.success(`比赛类型已改为 ${vehiclePoolLabel(res.vehicle_pool)}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingPool = false;
    }
  }

  // Game mode (AB / RB / SB): admins can change it any time.
  let savingMode = $state(false);
  async function saveGameMode(mode) {
    if (!adminOnly() || !mode || mode === tournament?.game_mode) return;
    savingMode = true;
    try {
      const res = await API.updateTournament(tid, { game_mode: mode });
      tournament = { ...tournament, game_mode: res.game_mode };
      toast.success(`比赛模式已改为 ${gameModeInfo(res.game_mode).code}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingMode = false;
    }
  }

  // Tier (S-D) and kind: admins can change them any time; "" = none.
  let savingTier = $state(false);
  async function saveTier(field, value) {
    if (!adminOnly() || value === (tournament?.[field] || "")) return;
    savingTier = true;
    try {
      const res = await API.updateTournament(tid, { [field]: value || null });
      tournament = { ...tournament, tier: res.tier, event_kind: res.event_kind };
      toast.success(`赛事等级已改为 ${tierTagText(res) || "未分级"}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingTier = false;
    }
  }

</script>

{#if editable && isAdmin}
  {@const field = "field w-full cursor-pointer"}
  <div class="grid grid-cols-2 gap-3">
    <label class="space-y-1">
      <span class="block text-small font-semibold text-muted-foreground">赛事等级</span>
      <select value={tournament.tier || ""} disabled={savingTier} onchange={(e) => saveTier("tier", e.currentTarget.value)} class={field}>
        <option value="">未分级</option>
        {#each EVENT_TIERS as tier (tier.id)}
          <option value={tier.id}>{tier.name}</option>
        {/each}
      </select>
    </label>
    <label class="space-y-1">
      <span class="block text-small font-semibold text-muted-foreground">赛事性质</span>
      <select value={tournament.event_kind || ""} disabled={savingTier} onchange={(e) => saveTier("event_kind", e.currentTarget.value)} class={field}>
        <option value="">未设置</option>
        {#each EVENT_KINDS as kind (kind.id)}
          <option value={kind.id}>{kind.name}</option>
        {/each}
      </select>
    </label>
    <label class="space-y-1">
      <span class="block text-small font-semibold text-muted-foreground">比赛模式</span>
      <select value={tournament.game_mode || "rb"} disabled={savingMode} onchange={(e) => saveGameMode(e.currentTarget.value)} class="{field} num">
        {#each GAME_MODES as mode (mode.id)}
          <option value={mode.id}>{mode.code} · {mode.name}</option>
        {/each}
      </select>
    </label>
    <label class="space-y-1">
      <span class="block text-small font-semibold text-muted-foreground">比赛类型</span>
      <select value={tournament.vehicle_pool} disabled={savingPool} onchange={(e) => saveEventPool(e.currentTarget.value)} class={field}>
        {#if !vehiclePoolLabel(tournament.vehicle_pool)}
          <option value={tournament.vehicle_pool}>未分类</option>
        {/if}
        {#each VEHICLE_POOLS as pool (pool.id)}
          <option value={pool.id}>{pool.name}</option>
        {/each}
      </select>
    </label>
  </div>
{:else}
  {#if tierTagText(tournament)}
    <span class="{TAG_BASE} {TIER_TAG[tournament.tier] || TAG_TONE.neutral}" title="赛事等级">{tierTagText(tournament)}</span>
  {/if}
  <span class="{TAG_BASE} {TAG_TONE.neutral} font-num" title={gameModeTitle(tournament.game_mode)}>{gameModeLabel(tournament.game_mode)}</span>
  {#if vehiclePoolLabel(tournament.vehicle_pool)}
    <span class="{TAG_BASE} {POOL_TAG[tournament.vehicle_pool] || TAG_TONE.neutral}">{vehiclePoolLabel(tournament.vehicle_pool)}</span>
  {/if}
{/if}
