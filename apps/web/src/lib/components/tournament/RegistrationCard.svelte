<script>
  // Registration stage: the visitor's own sign-up, and for admins manual
  // and multi-select registration of other players.
  import { userState } from "$lib/user.svelte.js";
  import { openProfile } from "$lib/profile-prompt.js";
  import { isRecentlySeen } from "$lib/players.js";
  import { eventFormatLabel } from "$lib/tournament.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import UsersIcon from "@lucide/svelte/icons/users";
  import CheckIcon from "@lucide/svelte/icons/check";

  // onregister(id): "" registers the visitor; onbatch(ids) registers several.
  let { tournament, isAdmin = false, isRegistered = false, unregisteredPlayers = [], onregister, onunregister, onbatch } = $props();

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
    class="text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer {selected.includes(p.id)
      ? 'bg-primary text-primary-foreground border-primary font-bold'
      : muted
        ? 'bg-muted/70 text-muted-foreground border-border/80 hover:bg-primary/80 hover:text-primary-foreground'
        : 'bg-muted text-foreground border-border/80 hover:bg-primary/80 hover:text-primary-foreground'}"
  >
    {selected.includes(p.id) ? "✓ " : ""}{p.display_name}
  </button>
{/snippet}

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-6">
    <Card.Title class="text-base font-bold flex items-center gap-2">
      <UsersIcon class="w-5 h-5 text-primary" />
      选手报名管理
    </Card.Title>
    <Card.Description class="text-xs">
      当报名人数达到设定或充足时，组织者可进行种子排序并生成{eventFormatLabel(tournament)} Bracket。
    </Card.Description>
  </Card.Header>
  <Card.Content class="p-6 pt-0 space-y-4">
    <div class="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
      {#if userState.id}
        <div class="flex items-center gap-3">
          <div data-no-i18n class="w-10 h-10 rounded-full bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white uppercase">
            {userState.id.slice(0, 2)}
          </div>
          <div>
            <p class="text-xs text-muted-foreground">当前浏览器 Gamer ID</p>
            <h4 class="font-bold text-foreground text-sm">{userState.id}</h4>
          </div>
        </div>
        {#if isRegistered}
          <div class="flex items-center gap-2">
            <Badge class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs gap-1 py-1">
              <CheckIcon class="w-3.5 h-3.5" /> 已在选手中
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onclick={() => onunregister(userState.id)}
              class="text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:bg-red-500/10 h-8 cursor-pointer"
            >
              取消报名
            </Button>
          </div>
        {:else}
          <Button onclick={() => onregister("")} size="sm" class="font-bold text-xs h-8 cursor-pointer">一键快速报名</Button>
        {/if}
      {:else}
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">?</div>
          <div>
            <p class="text-xs text-muted-foreground">未关联 Gamer ID</p>
            <p class="text-[10px] text-muted-foreground/80 mt-0.5">请先关联或在右侧输入框注册</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onclick={openProfile} class="text-xs h-8 cursor-pointer border-primary/30 text-primary animate-pulse">
          去关联游戏ID
        </Button>
      {/if}
    </div>

    {#if isAdmin}
      <div class="space-y-2.5">
        <label for="reg-id-input" class="text-xs font-bold text-muted-foreground">管理员手动为群友报名</label>
        <div class="flex gap-2">
          <Input
            id="reg-id-input"
            bind:value={regInput}
            placeholder="输入群友 ID，如 Vermilion"
            class="bg-background border-border text-foreground flex-1 h-9 text-xs"
          />
          <Button variant="secondary" size="sm" onclick={registerTyped} class="text-xs h-9 cursor-pointer">添加选手</Button>
        </div>

        {#if unregisteredPlayers.length > 0}
          <div class="space-y-2 pt-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-[10px] font-bold text-muted-foreground">多选选手批量报名（默认只显示一年内活跃）</span>
              {#if selected.length > 0}
                <div class="flex items-center gap-1.5">
                  <Button size="sm" onclick={registerSelected} class="h-7 text-[10px] px-2">批量报名 ({selected.length})</Button>
                  <Button variant="ghost" size="sm" onclick={() => (selected = [])} class="h-7 text-[10px] px-2">清空</Button>
                </div>
              {/if}
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-30 overflow-y-auto pr-1">
              {#each active as p (p.id)}
                {@render chip(p, false)}
              {:else}
                <span class="text-[10px] text-muted-foreground/60 italic px-1">暂无最近一年活跃的未报名选手</span>
              {/each}
            </div>
            {#if inactive.length > 0}
              <details class="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5" bind:open={showInactive}>
                <summary class="text-[10px] text-muted-foreground cursor-pointer select-none">
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
