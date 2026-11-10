<script>
  // Registration stage: the visitor's own sign-up, and for admins manual
  // and multi-select registration of other players.
  import { userState } from "#lib/user.svelte.js";
  import { openProfile } from "#lib/profile-prompt.js";
  import { isRecentlySeen } from "#lib/players.js";
  import { eventFormatLabel } from "#lib/tournament.js";
  import { API } from "#lib/api.js";
  import { ladderLimitLabel } from "#lib/ladder-limit.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import DiscordButton from "#lib/components/discord/DiscordButton.svelte";
  import DiscordIcon from "#lib/components/discord/DiscordIcon.svelte";
  import { discord, markDiscordJoined } from "#lib/discord.svelte.js";
  import UsersIcon from "@lucide/svelte/icons/users";
  import CheckIcon from "@lucide/svelte/icons/check";

  // onregister(id): "" registers the visitor; onbatch(ids) registers several.
  let { tournament, isAdmin = false, isRegistered = false, unregisteredPlayers = [], onregister, onunregister, onbatch } = $props();

  // Ladder limit: whether the visitor may sign up, asked before they try
  // (the server checks again). Admins are not limited.
  let limitLabel = $derived(ladderLimitLabel(tournament));
  let eligibility = $state(null);
  $effect(() => {
    const id = userState.id;
    const key = `${tournament?.id}|${limitLabel}|${id}`;
    eligibility = null;
    if (!limitLabel || !id || isAdmin || isRegistered) return;
    API.ladderEligibility(tournament.id, id)
      .then((res) => {
        if (`${tournament?.id}|${limitLabel}|${userState.id}` === key) eligibility = res;
      })
      .catch(() => {});
  });
  let blocked = $derived(Boolean(eligibility?.problem));

  let regInput = $state("");
  let selected = $state([]);
  let showInactive = $state(false);
  let active = $derived(unregisteredPlayers.filter((p) => isRecentlySeen(p.last_seen_at)));
  let inactive = $derived(unregisteredPlayers.filter((p) => !isRecentlySeen(p.last_seen_at)));

  function toggle(id) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  async function registerTyped() {
    if (await onregister(regInput.trim())) regInput = "";
  }

  async function registerSelected() {
    const ids = [...selected];
    selected = [];
    await onbatch(ids);
  }

  const seen = (p) => (p.last_seen_at ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}` : "无登录记录");
</script>

{#snippet chip(p, muted)}
  <button
    type="button"
    onclick={() => toggle(p.id)}
    title={seen(p)}
    class="text-small px-2 py-0.5 rounded border transition-colors cursor-pointer {selected.includes(p.id)
      ? 'bg-primary text-primary-foreground border-primary font-bold'
      : muted
        ? 'bg-muted/70 text-muted-foreground border-border/80 hover:bg-primary/80 hover:text-primary-foreground'
        : 'bg-muted text-foreground border-border/80 hover:bg-primary/80 hover:text-primary-foreground'}"
  >
    {selected.includes(p.id) ? "✓ " : ""}{p.display_name}
  </button>
{/snippet}

<Card.Root id="registration-card" class="border-border bg-card/40">
  <Card.Header class="p-6">
    <Card.Title class="text-base font-bold flex items-center gap-2">
      <UsersIcon class="w-5 h-5 text-brand-ink" />
      {isAdmin ? "选手报名管理" : "报名"}
    </Card.Title>
    <Card.Description class="text-xs">
      {#if isAdmin}
        人数足够后，可以排好种子并开赛，生成{eventFormatLabel(tournament)}对阵。
      {:else}
        <span>报名后请留意开赛时间。</span>{#if tournament.checkin?.enabled}<span>开赛前 30 分钟记得签到。</span>{/if}<span>对阵由管理员在开赛时生成。</span>
      {/if}
    </Card.Description>
  </Card.Header>
  <Card.Content class="p-6 pt-0 space-y-4">
    <div class="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
      {#if userState.id}
        <div class="flex items-center gap-3 self-stretch sm:self-auto">
          <div data-no-i18n class="w-10 h-10 shrink-0 rounded-full bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white uppercase">
            {userState.id.slice(0, 2)}
          </div>
          <div class="min-w-0">
            <p class="text-sm"><span class="text-muted-foreground">{isRegistered ? "已报名：" : "报名选手："}</span><span class="font-bold text-foreground">{userState.id}</span></p>
            <p class="text-small text-muted-foreground">
              <span class="num">已报名 {tournament.players?.length || 0} / {tournament.player_capacity || 0} 人</span>{#if tournament.checkin?.enabled}<span> · 开赛前 30 分钟签到</span>{/if}
            </p>
          </div>
        </div>
        {#if isRegistered}
          <div class="flex items-center gap-2">
            <Badge class="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs gap-1 py-1">
              <CheckIcon class="w-3.5 h-3.5" /> 已在选手中
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onclick={() => onunregister(userState.id)}
              class="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-500/20 hover:bg-red-500/10 h-8 cursor-pointer"
            >
              取消报名
            </Button>
          </div>
        {:else}
          <Button onclick={() => onregister("")} disabled={blocked} class="w-full font-bold sm:w-auto cursor-pointer">一键快速报名</Button>
        {/if}
      {:else}
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">?</div>
          <div>
            <p class="text-xs text-muted-foreground">还没有设置选手 ID</p>
            <p class="text-small text-muted-foreground/80 mt-0.5">填写选手 ID 和 QQ / Discord 联系方式后就能报名</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onclick={openProfile} class="text-xs h-8 cursor-pointer border-primary/30 text-brand-ink animate-pulse">
          设置选手 ID
        </Button>
      {/if}
    </div>

    <!-- Registered: the next step is the Discord server. -->
    {#if userState.id && isRegistered}
      <div class="flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center {discord.joined ? 'border-border bg-muted/20' : 'border-[#5865F2]/30 bg-[#5865F2]/8'}">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#5865F2] text-white"><DiscordIcon class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-foreground">{discord.joined ? "Potato Cup Discord 服务器" : "下一步：加入 Discord 服务器"}</p>
          <p class="text-small text-muted-foreground">{discord.joined ? "赛事通知、和对手约战、找管理员都在服务器里。" : "赛事通知、和对手约战、找管理员都在服务器里，比赛前请先加入。"}</p>
        </div>
        <DiscordButton variant={discord.joined ? "outline" : "solid"} label={discord.joined ? "打开服务器" : "加入服务器"} onclick={markDiscordJoined} />
      </div>
    {/if}

    {#if limitLabel}
      <p class="rounded-lg border px-3 py-2 text-xs {blocked ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'}">
        {#if blocked}
          {eligibility.problem}
        {:else}
          <span>本场比赛限{limitLabel}的选手报名（按本场比赛的天梯计算，需要已完成定级）。</span>{#if isAdmin}<span>管理员代报不受限制。</span>{:else if eligibility?.mmr != null}<span>你的天梯分 {eligibility.mmr}{eligibility.tier ? ` · ${eligibility.tier}` : ""}。</span>{/if}
        {/if}
      </p>
    {/if}

    {#if isAdmin}
      <div class="space-y-2.5">
        <label for="reg-id-input" class="text-small font-semibold text-muted-foreground">管理员手动为群友报名</label>
        <div class="flex gap-2">
          <Input
            id="reg-id-input"
            bind:value={regInput}
            placeholder="输入群友 ID，如 Vermilion"
            class="bg-background flex-1"
          />
          <Button variant="secondary" size="sm" onclick={registerTyped} class="cursor-pointer">添加选手</Button>
        </div>

        {#if unregisteredPlayers.length > 0}
          <div class="space-y-2 pt-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-small font-bold text-muted-foreground">多选选手批量报名（默认只显示一年内活跃）</span>
              {#if selected.length > 0}
                <div class="flex items-center gap-1.5">
                  <Button size="sm" onclick={registerSelected} class="h-7 text-small px-2">批量报名 ({selected.length})</Button>
                  <Button variant="ghost" size="sm" onclick={() => (selected = [])} class="h-7 text-small px-2">清空</Button>
                </div>
              {/if}
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-30 overflow-y-auto pr-1">
              {#each active as p (p.id)}
                {@render chip(p, false)}
              {:else}
                <span class="text-small text-muted-foreground/60 italic px-1">暂无最近一年活跃的未报名选手</span>
              {/each}
            </div>
            {#if inactive.length > 0}
              <details class="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5" bind:open={showInactive}>
                <summary class="text-small text-muted-foreground cursor-pointer select-none">
                  显示一年未登录的选手（{inactive.length}）
                </summary>
                <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1 mt-1.5">
                  {#each inactive as p (p.id)}
                    {@render chip(p, true)}
                  {/each}
                </div>
              </details>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
