<script>
  // Profile fields of the signed-in player: ID (admins only; the in-game
  // name), contact, nationality, team and an optional Liquipedia page.
  import { userState } from "#lib/user.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import FlagSelect from "./FlagSelect.svelte";

  let {
    idInput = $bindable(""),
    qq = $bindable(""),
    discord = $bindable(""),
    flag = $bindable(""),
    team = $bindable(""),
    link = $bindable(""),
  } = $props();

  const field = "bg-background";
</script>

<div class="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
  <div class="space-y-1">
    <label for="player-id-input" class="text-small font-semibold text-muted-foreground">游戏内昵称（选手 ID）</label>
    <Input id="player-id-input" bind:value={idInput} disabled={!!userState.id && !userState.adminToken} class={field} />
    <p class="text-small text-muted-foreground/70">
      应与战争雷霆里显示的名字一致（不是数字账号 ID）。{#if userState.id && !userState.adminToken}游戏里改了名，请联系管理员改选手 ID，以前的战绩会一起带过去。{/if}
    </p>
  </div>

  <div class="space-y-2">
    <span class="text-xs font-bold text-muted-foreground">联系方式（QQ / Discord）</span>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/20 border border-border/60 p-3 rounded-xl">
      <div class="space-y-1">
        <label for="layout-contact-qq" class="text-small font-semibold text-muted-foreground">QQ 号</label>
        <Input id="layout-contact-qq" bind:value={qq} placeholder="例如: 123456789" class={field} />
      </div>
      <div class="space-y-1">
        <label for="layout-contact-discord" class="text-small font-semibold text-muted-foreground">Discord 用户名</label>
        <Input id="layout-contact-discord" bind:value={discord} placeholder="例如: username" class={field} />
      </div>
    </div>
    <p class="text-small text-muted-foreground/60">赛务联系用，会显示在选手列表中。</p>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div class="space-y-1">
      <label for="edit-flag" class="text-small font-semibold text-muted-foreground">国籍 / 地区</label>
      <FlagSelect id="edit-flag" bind:value={flag} />
    </div>
    <div class="space-y-1">
      <label for="edit-team" class="text-small font-semibold text-muted-foreground">战队</label>
      <Input id="edit-team" bind:value={team} placeholder="战队缩写" class={field} />
    </div>
  </div>

  <div class="space-y-1">
    <label for="edit-link" class="text-small font-semibold text-muted-foreground">Liquipedia Wiki 页面（可选）</label>
    <Input id="edit-link" bind:value={link} placeholder="没有可以留空" class={field} />
    <p class="text-small text-muted-foreground/60">
      只有在 Liquipedia 上有个人页面的选手才需要填，链接到 https://liquipedia.net/warthunder/&lt;名称&gt;；留空不影响报名和比赛。
    </p>
  </div>
</div>
