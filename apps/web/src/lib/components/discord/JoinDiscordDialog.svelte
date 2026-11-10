<script>
  // After a player registers: "报名成功" and the next step, joining the
  // Discord server (#lib/discord.svelte.js). Mounted once in the root
  // layout. Opening the invite or saying they are in already ends it for
  // good on this browser; "以后再说" only closes it.
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { discord, markDiscordJoined } from "#lib/discord.svelte.js";
  import DiscordButton from "./DiscordButton.svelte";
  import DiscordIcon from "./DiscordIcon.svelte";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ClockIcon from "@lucide/svelte/icons/clock";

  const close = () => (discord.prompt.open = false);
</script>

<Dialog.Root open={discord.prompt.open} onOpenChange={(open) => !open && close()}>
  <Dialog.Content class="sm:max-w-[420px] gap-0 overflow-hidden border border-border bg-card p-0">
    <div class="flex flex-col items-center gap-2 px-6 pt-6 pb-4 text-center">
      <span class="flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <CheckIcon class="size-6" />
      </span>
      <Dialog.Title class="text-lg font-black">报名成功</Dialog.Title>
      {#if discord.prompt.event}
        <Dialog.Description class="text-sm text-muted-foreground">你已报名 <span class="font-semibold text-foreground">{discord.prompt.event}</span></Dialog.Description>
      {:else}
        <Dialog.Description class="sr-only">报名成功</Dialog.Description>
      {/if}
    </div>

    <div class="mx-4 mb-4 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/8 p-4">
      <div class="flex items-center gap-2.5">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#5865F2] text-white"><DiscordIcon class="size-5" /></span>
        <div class="min-w-0">
          <p class="text-small font-bold text-[#4752C4] dark:text-[#a5acff]">下一步</p>
          <p class="text-sm font-black text-foreground">加入 Potato Cup Discord 服务器</p>
        </div>
      </div>
      <p class="mt-2 text-small leading-relaxed text-muted-foreground">赛事通知、和对手约战、找管理员都在服务器里，比赛前请先加入。</p>
      <DiscordButton class="mt-3 h-10 w-full text-sm" label="加入 Discord 服务器" onclick={markDiscordJoined} />
    </div>

    {#if discord.prompt.checkin}
      <p class="mx-4 mb-4 flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-small text-brand-soft-foreground">
        <ClockIcon class="mt-0.5 size-3.5 shrink-0" />
        这场比赛需要签到：开赛前 30 分钟回到赛事页面签到，未签到可能被移出。
      </p>
    {/if}

    <div class="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-3">
      <button type="button" onclick={markDiscordJoined} class="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer">我已经在服务器里了</button>
      <button type="button" onclick={close} class="h-8 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted cursor-pointer">以后再说</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
