<script>
  // Header button for match reminders (browser push, $lib/push.js).
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { disablePush, enablePush, pushIsEnabled, pushSupported } from "$lib/push.js";
  import BellIcon from "@lucide/svelte/icons/bell";
  import BellOffIcon from "@lucide/svelte/icons/bell-off";

  let enabled = $state(false);
  let busy = $state(false);

  onMount(() => {
    pushIsEnabled().then((on) => (enabled = on));
  });

  async function toggle() {
    if (busy) return;
    if (!pushSupported()) {
      toast.error("当前浏览器不支持比赛提醒");
      return;
    }
    busy = true;
    try {
      if (enabled) {
        await disablePush();
        enabled = false;
        toast.info("已关闭比赛提醒");
      } else {
        await enablePush();
        enabled = true;
        toast.success("比赛提醒已开启，开赛前 1 小时会通知你");
      }
    } catch (e) {
      toast.error(e.plain ? e.message : `${enabled ? "关闭" : "开启"}比赛提醒失败: ${e.message}`);
    } finally {
      busy = false;
    }
  }
</script>

<button
  id="header-push-toggle"
  onclick={toggle}
  disabled={busy}
  title={enabled ? "关闭比赛提醒" : "开启比赛提醒（开赛前 1 小时）"}
  aria-label={enabled ? "关闭比赛提醒" : "开启比赛提醒"}
  class="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:opacity-50
    {enabled ? 'text-primary bg-primary/10 hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
>
  {#if enabled}
    <BellIcon class="h-4 w-4" />
  {:else}
    <BellOffIcon class="h-4 w-4" />
  {/if}
</button>
