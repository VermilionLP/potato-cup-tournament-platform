<script>
  // The editable tags of an event (admins get selects, others tags): tier
  // and kind, game mode, event type and the Ban / Pick vehicle pool template.
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { resolveTemplate } from "$lib/vehicle-pools.js";
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
  } from "$lib/tournament.js";

  let { tournament = $bindable(), tid, isAdmin = false, vehicleTemplates = [], bpTemplate = null } = $props();

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
      toast.success(`比赛模式已改为 ${gameModeInfo(res.game_mode).code} ${gameModeInfo(res.game_mode).name}`);
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

  // Ban / Pick vehicle pool template: automatic (best match for the event
  // type and game mode) unless an admin picks one.
  let typeTemplates = $derived(vehicleTemplates.filter((t) => t.event_type === tournament?.vehicle_pool));
  let autoTemplate = $derived(resolveTemplate(vehicleTemplates, { ...tournament, vehicle_template: null }));
  let savingTemplate = $state(false);
  async function saveTemplate(id) {
    if (!adminOnly() || id === (tournament?.vehicle_template || "")) return;
    savingTemplate = true;
    try {
      const res = await API.updateTournament(tid, { vehicle_template: id || null });
      tournament = { ...tournament, vehicle_template: res.vehicle_template ?? null };
      toast.success(id ? "已指定载具池模板" : "载具池模板改为自动匹配");
    } catch (e) {
      toast.error(e.message);
    } finally {
      savingTemplate = false;
    }
  }
</script>

{#if isAdmin}
  <select
    aria-label="赛事等级"
    title="赛事等级"
    value={tournament.tier || ""}
    disabled={savingTier}
    onchange={(e) => saveTier("tier", e.currentTarget.value)}
    class="h-6 rounded-md border px-1.5 text-xs font-bold cursor-pointer disabled:opacity-60 {TIER_TAG[tournament.tier] || 'border-border bg-background text-foreground'}"
  >
    <option value="">未分级</option>
    {#each EVENT_TIERS as tier (tier.id)}
      <option value={tier.id}>{tier.name}</option>
    {/each}
  </select>
  <select
    aria-label="赛事性质"
    title="赛事性质"
    value={tournament.event_kind || ""}
    disabled={savingTier}
    onchange={(e) => saveTier("event_kind", e.currentTarget.value)}
    class="h-6 rounded-md border border-border bg-background px-1.5 text-xs font-semibold text-foreground cursor-pointer disabled:opacity-60"
  >
    <option value="">未设置性质</option>
    {#each EVENT_KINDS as kind (kind.id)}
      <option value={kind.id}>{kind.name}</option>
    {/each}
  </select>
{:else if tierTagText(tournament)}
  <span class="rounded-md border px-2 py-0.5 font-bold {TIER_TAG[tournament.tier] || 'border-border bg-muted/60 text-muted-foreground'}" title="赛事等级">{tierTagText(tournament)}</span>
{/if}
{#if isAdmin}
  <select
    aria-label="比赛模式"
    title="比赛模式"
    value={tournament.game_mode || "rb"}
    disabled={savingMode}
    onchange={(e) => saveGameMode(e.currentTarget.value)}
    class="h-6 rounded-md border border-border bg-background px-1.5 text-xs font-mono font-bold text-foreground cursor-pointer disabled:opacity-60"
  >
    {#each GAME_MODES as mode (mode.id)}
      <option value={mode.id}>{mode.code} {mode.name}</option>
    {/each}
  </select>
{:else}
  <span class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono font-bold text-foreground/80" title={gameModeTitle(tournament.game_mode)}>{gameModeLabel(tournament.game_mode)}</span>
{/if}
{#if isAdmin}
  <select
    aria-label="比赛类型"
    title="比赛类型"
    value={tournament.vehicle_pool}
    disabled={savingPool}
    onchange={(e) => saveEventPool(e.currentTarget.value)}
    class="h-6 rounded-md border px-1.5 text-xs font-semibold cursor-pointer disabled:opacity-60 {POOL_TAG[tournament.vehicle_pool] || 'border-border bg-background text-foreground'}"
  >
    {#if !vehiclePoolLabel(tournament.vehicle_pool)}
      <option value={tournament.vehicle_pool}>未分类</option>
    {/if}
    {#each VEHICLE_POOLS as pool (pool.id)}
      <option value={pool.id}>{pool.name}</option>
    {/each}
  </select>
{:else if vehiclePoolLabel(tournament.vehicle_pool)}
  <span class="rounded-md border px-2 py-0.5 font-semibold {POOL_TAG[tournament.vehicle_pool] || 'border-border bg-muted/60 text-muted-foreground'}">{vehiclePoolLabel(tournament.vehicle_pool)}</span>
{/if}
{#if tournament.banpick_enabled !== false && vehicleTemplates.length}
  {#if isAdmin}
    <select
      aria-label="载具池模板"
      title="Ban / Pick 使用的载具池模板"
      value={tournament.vehicle_template || ""}
      disabled={savingTemplate}
      onchange={(e) => saveTemplate(e.currentTarget.value)}
      class="h-6 rounded-md border border-border bg-background px-1.5 text-xs font-semibold text-foreground cursor-pointer disabled:opacity-60"
    >
      <option value="">载具池：自动（{autoTemplate?.name || "无"}）</option>
      {#if tournament.vehicle_template && !typeTemplates.some((t) => t.id === tournament.vehicle_template)}
        <option value={tournament.vehicle_template}>载具池：{bpTemplate?.name || tournament.vehicle_template}</option>
      {/if}
      {#each typeTemplates as t (t.id)}
        <option value={t.id}>载具池：{t.name}</option>
      {/each}
    </select>
  {:else if bpTemplate}
    <a href="/pools?template={bpTemplate.id}" class="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-semibold text-muted-foreground hover:text-primary" title="Ban / Pick 载具池">载具池：{bpTemplate.name}</a>
  {/if}
{/if}
