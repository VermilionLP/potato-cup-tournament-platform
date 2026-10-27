<script>
  // Admin: move the match time after registration opened.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import DateTimePicker from "$lib/components/DateTimePicker.svelte";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import { formatScheduled, parseLocal } from "$lib/datetime.js";

  let { open = $bindable(false), value = $bindable(""), current = "", saving = false, onsave } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[520px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground flex items-center gap-2">
        <ClockIcon class="w-4 h-4 text-primary" />
        调整比赛时间
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        当前：{current ? `北京时间 ${formatScheduled(current)}` : "未设置"}。按北京时间填写，选手会自动看到各自时区的时间；日历文件同步更新。
      </Dialog.Description>
    </Dialog.Header>
    {#if open}
      <DateTimePicker bind:value clearable={false} startOpen={true} />
    {/if}
    <Dialog.Footer class="flex gap-2">
      <Button variant="outline" size="sm" onclick={() => (open = false)} disabled={saving}>取消</Button>
      <Button size="sm" onclick={onsave} disabled={saving || !parseLocal(value)} class="font-bold">
        {saving ? "保存中…" : "保存"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
