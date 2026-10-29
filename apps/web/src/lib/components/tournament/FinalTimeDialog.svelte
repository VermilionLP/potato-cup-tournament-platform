<script>
  // Ending the time vote ("结束投票并开启报名"): pick or type the final match
  // time; start() preselects the most voted future time. onsaved(tournament)
  // gets the event, now open for registration.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { formatVoteTime as formatTime } from "$lib/votes.js";

  let { tid, options = [], ensureAdmin, needsIdentity, onsaved } = $props();

  let open = $state(false);
  let value = $state("");

  export function start() {
    if (needsIdentity()) return;
    const future = options.filter((opt) => new Date(opt.proposed_time).getTime() >= Date.now());
    const top = [...future].sort((a, b) => b.count - a.count)[0];
    value = top ? formatTime(top.proposed_time) : "";
    open = true;
  }

  async function confirmTime() {
    if (!ensureAdmin()) return;
    if (!value.trim()) return toast.error("请选择或输入确定的比赛时间");
    try {
      const res = await API.updateStatus(tid, "registration", value.trim());
      const autoCount = res.auto_registered?.length || 0;
      toast.success(
        `赛事已开启报名，比赛时间已定为: ${value}` + (autoCount > 0 ? `，已自动报名 ${autoCount} 名投票选手` : ""),
      );
      open = false;
      await onsaved?.(res);
    } catch (e) {
      toast.error(e.message);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-100 bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
        <ClockIcon class="w-5 h-5 text-primary" />
        确定比赛时间
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        请确定比赛最终进行的时间。开启报名后，选手将能看到此时间。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-3">
      <div class="space-y-1.5">
        <label for="final-time-input" class="text-xs font-bold text-muted-foreground">确定的比赛时间 (支持输入自定义文字)</label>
        <Input
          id="final-time-input"
          bind:value
          placeholder="例如: 2026-06-20 20:00 或 本周六晚8点"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      {#if options.length > 0}
        <div class="space-y-2">
          <span class="text-xs font-bold text-muted-foreground block">根据投票结果快捷点选：</span>
          <div class="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
            {#each options as opt}
              {@const displayTime = formatTime(opt.proposed_time)}
              <button
                type="button"
                onclick={() => (value = displayTime)}
                class="flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-xs cursor-pointer text-left
                {value === displayTime
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-background/40 border-border hover:border-primary/40 hover:bg-background/80 text-foreground'}"
              >
                <span>{displayTime}</span>
                <Badge variant="secondary" class="bg-primary/20 text-primary font-bold text-[10px]">{opt.count} 票</Badge>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button variant="outline" size="sm" onclick={() => (open = false)} class="w-full sm:w-auto text-xs">取消</Button>
      <Button size="sm" onclick={confirmTime} class="w-full sm:w-auto text-xs font-bold">确定并开启报名</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
