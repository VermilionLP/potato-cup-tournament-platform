<script>
  // Admin: edit a participant's profile (ID, contact, flag, team, wiki link).
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Flag from "$lib/components/Flag.svelte";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  let {
    open = $bindable(false),
    id = $bindable(""),
    qq = $bindable(""),
    discord = $bindable(""),
    flag = $bindable("cn"),
    team = $bindable(""),
    link = $bindable(""),
    onsave,
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-105 bg-card border border-border p-6 flex flex-col gap-4">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground flex items-center gap-2">
        <SettingsIcon class="w-5 h-5 text-primary" />
        编辑选手资料
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        配置选手的展示名称、国籍、战队前缀等 Liquipedia Wiki 导出字段。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-1.5">
        <label for="edit-player-id" class="text-xs font-bold text-muted-foreground">选手唯一 ID (Player ID)</label>
        <Input
          id="edit-player-id"
          bind:value={id}
          placeholder="选手唯一 ID（修改后会自动刷新全库所有对局和记录）"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <div class="space-y-2.5">
        <span class="text-xs font-bold text-muted-foreground">联系方式（QQ / Discord）</span>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 border border-border/60 p-4 rounded-xl">
          <div class="space-y-1">
            <label for="edit-contact-qq" class="text-[11px] font-bold text-muted-foreground">QQ 号</label>
            <Input id="edit-contact-qq" bind:value={qq} placeholder="例如: 123456789" class="text-xs h-8 bg-background border-border text-foreground" />
          </div>
          <div class="space-y-1">
            <label for="edit-contact-discord" class="text-[11px] font-bold text-muted-foreground">Discord 用户名</label>
            <Input id="edit-contact-discord" bind:value={discord} placeholder="例如: username" class="text-xs h-8 bg-background border-border text-foreground" />
          </div>
        </div>
        <p class="text-[10px] text-muted-foreground/60">赛务联系用，会显示在选手列表中。</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="edit-flag" class="text-xs font-bold text-muted-foreground">国籍/地区 (Flag)</label>
          <div class="flex items-center gap-2">
            <Flag code={flag} size={20} />
            <Input id="edit-flag" bind:value={flag} placeholder="例如: cn, hk, tw" class="bg-background border-border text-foreground text-xs flex-1" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="edit-team" class="text-xs font-bold text-muted-foreground">战队前缀 (Team Tag)</label>
          <Input id="edit-team" bind:value={team} placeholder="例如: AlphaX" class="bg-background border-border text-foreground text-xs" />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="edit-link" class="text-xs font-bold text-muted-foreground">Wiki 个人页链接 (Link)</label>
        <Input id="edit-link" bind:value={link} placeholder="例如: Vermilion" class="bg-background border-border text-foreground text-xs" />
        <p class="text-[10px] text-muted-foreground/60">
          Liquipedia Wiki 页面名称，最终将链接至
          https://liquipedia.net/warthunder/&lt;名称&gt;
        </p>
      </div>
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button variant="outline" size="sm" onclick={() => (open = false)} class="w-full sm:w-auto text-xs">取消</Button>
      <Button size="sm" onclick={onsave} class="w-full sm:w-auto text-xs font-bold">保存资料</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
