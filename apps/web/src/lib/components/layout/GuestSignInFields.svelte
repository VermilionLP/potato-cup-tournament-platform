<script>
  // Sign-in fields for a visitor: required contact, player ID, and quick
  // picks of existing players (recently active first).
  import { isRecentlySeen } from "$lib/players.js";
  import { parseContact } from "$lib/contact.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let {
    idInput = $bindable(""),
    contactInput = $bindable(""),
    contactError = "",
    players = [],
    onsubmit,
  } = $props();

  let showInactive = $state(false);
  let active = $derived(players.filter((p) => isRecentlySeen(p.last_seen_at)));
  let inactive = $derived(players.filter((p) => !isRecentlySeen(p.last_seen_at)));

  // Picking a player fills in the contact already on file.
  function pick(player) {
    idInput = player.id;
    const contact = parseContact(player?.battle_tags);
    contactInput = contact.qq || contact.discord || "";
  }

  const onEnter = (e) => {
    if (e.key === "Enter") onsubmit?.();
  };
</script>

{#snippet playerChip(p, muted)}
  <button
    type="button"
    onclick={() => pick(p)}
    title={p.last_seen_at ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}` : "无登录记录"}
    class="text-[11px] px-2 py-0.5 rounded {muted ? 'bg-muted/70' : 'bg-muted'} hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer
      {idInput === p.id ? 'bg-primary text-primary-foreground border-primary font-bold' : muted ? 'text-muted-foreground' : 'text-foreground'}"
  >
    {p.display_name}
  </button>
{/snippet}

<div class="space-y-4 py-2">
  <div class="space-y-1.5">
    <label for="layout-contact-input" class="text-xs font-semibold text-muted-foreground">QQ 号 / Discord 用户名（必填）</label>
    <Input
      id="layout-contact-input"
      bind:value={contactInput}
      placeholder="例如: 123456789 或 username"
      class="bg-background border-border text-foreground"
      onkeydown={onEnter}
    />
    <p class="text-[10px] text-muted-foreground/70">
      赛务联系用，报名和投票前必须填写。纯数字视为 QQ 号，其余视为 Discord 用户名；会写入选手资料。
    </p>
    {#if contactError}
      <p class="text-[10px] text-destructive font-medium animate-pulse">{contactError}</p>
    {/if}
  </div>

  <div class="space-y-1.5">
    <label for="player-id-input" class="text-xs font-medium text-muted-foreground">选手游戏昵称 / ID</label>
    <Input
      id="player-id-input"
      bind:value={idInput}
      placeholder="例如: Vermilion"
      class="bg-background border-border text-foreground"
      onkeydown={onEnter}
    />
  </div>

  {#if players.length > 0}
    <div class="space-y-1.5">
      <span class="text-xs font-medium text-muted-foreground block">快捷选择最近一年活跃的选手 ID：</span>
      <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1">
        {#each active as p (p.id)}
          {@render playerChip(p, false)}
        {:else}
          <span class="text-[10px] text-muted-foreground/60 italic px-1">暂无最近一年活跃的选手</span>
        {/each}
      </div>
      {#if inactive.length > 0}
        <details class="mt-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5" bind:open={showInactive}>
          <summary class="text-[10px] text-muted-foreground cursor-pointer select-none">
            显示一年未登录的选手（{inactive.length}）
          </summary>
          <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1 mt-1.5">
            {#each inactive as p (p.id)}
              {@render playerChip(p, true)}
            {/each}
          </div>
        </details>
      {/if}
    </div>
  {/if}
</div>
