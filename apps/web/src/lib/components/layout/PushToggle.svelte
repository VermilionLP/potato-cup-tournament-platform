<script>
  // Header button for match reminders (browser push, $lib/push.js): the
  // start reminder for everyone, and personal notices ("your match is
  // ready", "confirm the score") for the player ID set in this browser.
  // The subscription follows that ID when it changes.
  import { onMount } from "svelte";
  import { userState } from "$lib/user.svelte.js";
  import { toast } from "svelte-sonner";
  import { disablePush, enablePush, pushIsEnabled, pushSupported } from "$lib/push.js";
  import BellIcon from "@lucide/svelte/icons/bell";
  import BellOffIcon from "@lucide/svelte/icons/bell-off";

  let enabled = $state(false);
  let busy = $state(false);

  onMount(() => {
    pushIsEnabled().then((on) => (enabled = on));
  });

  // Re-send the subscription when the player ID changes, so personal
  // notices go to the right player.
  let lastId = userState.id;
  $effect(() => {
    const id = userState.id;
    if (id === lastId) return;
    lastId = id;
    if (enabled) pushIsEnabled();
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
        toast.success(userState.id ? "比赛提醒已开启：开赛前 1 小时，以及轮到你比赛、需要确认比分时都会通知你" : "比赛提醒已开启，开赛前 1 小时会通知你；填写选手 ID 后还会收到轮到你比赛的通知");
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
  title={enabled ? "关闭比赛提醒" : "开启比赛提醒（开赛前 1 小时、轮到你比赛时）"}
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
