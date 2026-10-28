<script>
  // Profile fields of the signed-in player: ID (admins only), contact,
  // flag, team and Liquipedia page.
  import { userState } from "$lib/user.svelte.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Flag from "$lib/components/Flag.svelte";

  let {
    idInput = $bindable(""),
    qq = $bindable(""),
    discord = $bindable(""),
    flag = $bindable("cn"),
    team = $bindable(""),
    link = $bindable(""),
  } = $props();

  const field = "text-xs h-8 bg-background border-border text-foreground";
</script>

<div class="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
  <div class="space-y-1">
    <label for="player-id-input" class="text-xs font-bold text-muted-foreground">选手游戏昵称 / ID</label>
    <Input id="player-id-input" bind:value={idInput} disabled={!!userState.id && !userState.adminToken} class={field} />
    {#if userState.id && !userState.adminToken}
      <p class="text-[9px] text-muted-foreground/70">修改选手 ID 需要管理员权限；普通用户只能维护资料。</p>
    {/if}
  </div>

  <div class="space-y-2">
    <span class="text-xs font-bold text-muted-foreground">联系方式（QQ / Discord）</span>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/20 border border-border/60 p-3 rounded-xl">
      <div class="space-y-1">
        <label for="layout-contact-qq" class="text-[11px] font-bold text-muted-foreground">QQ 号</label>
        <Input id="layout-contact-qq" bind:value={qq} placeholder="例如: 123456789" class={field} />
      </div>
      <div class="space-y-1">
        <label for="layout-contact-discord" class="text-[11px] font-bold text-muted-foreground">Discord 用户名</label>
        <Input id="layout-contact-discord" bind:value={discord} placeholder="例如: username" class={field} />
      </div>
    </div>
    <p class="text-[10px] text-muted-foreground/60">赛务联系用，会显示在选手列表中。</p>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div class="space-y-1">
      <label for="edit-flag" class="text-xs font-bold text-muted-foreground">国籍 (Flag)</label>
      <div class="flex items-center gap-2">
        <Flag code={flag} size={20} />
        <Input id="edit-flag" bind:value={flag} placeholder="cn / hk / tw" class="{field} flex-1" />
      </div>
    </div>
    <div class="space-y-1">
      <label for="edit-team" class="text-xs font-bold text-muted-foreground">战队</label>
      <Input id="edit-team" bind:value={team} placeholder="战队缩写" class={field} />
    </div>
  </div>

  <div class="space-y-1">
    <label for="edit-link" class="text-xs font-bold text-muted-foreground">Wiki 页面名称</label>
    <Input id="edit-link" bind:value={link} placeholder="例如: Vermilion" class={field} />
    <p class="text-[10px] text-muted-foreground/60">
      Liquipedia Wiki 页面名称，最终将链接至
      https://liquipedia.net/warthunder/&lt;名称&gt;
    </p>
  </div>
</div>
