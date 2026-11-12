<script>
  // The header's bell: the reminder centre. Three ways to be reminded, each
  // with its state in plain words:
  //   calendar       a subscription feed (the player's own events, or all)
  //                  whose alarms ring on the phone / computer itself;
  //   notifications  browser push (#lib/push.js), with a test button;
  //   on this site   the banner, tab-title blink and sound while a page is
  //                  open (#lib/reminders.svelte.js);
  //   QQ             the bots in the Potato Cup QQ group: notices @ the QQ
  //                  number in the profile; binding (a code sent to the
  //                  official bot) lets the player ask it for their schedule.
  // The badge counts what needs the player now.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { userState } from "#lib/user.svelte.js";
  import { reminders } from "#lib/reminders.svelte.js";
  import { calendarUrl, webcalUrl } from "#lib/reminders.js";
  import { copyText, selectText } from "#lib/clipboard.js";
  import { API } from "#lib/api.js";
  import { disablePush, enablePush, pushIsEnabled, pushStatus, sendTestPush } from "#lib/push.js";
  import BellIcon from "@lucide/svelte/icons/bell";
  import BellRingIcon from "@lucide/svelte/icons/bell-ring";
  import CalendarPlusIcon from "@lucide/svelte/icons/calendar-plus";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import CheckIcon from "@lucide/svelte/icons/check";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";

  let open = $state(false);
  let subscribed = $state(false);
  let status = $state("off");
  let busy = $state(false);
  let origin = $state("");
  let help = $state(false);

  async function refreshStatus() {
    subscribed = await pushIsEnabled();
    status = typeof window !== "undefined" && !window.isSecureContext ? "insecure" : pushStatus(subscribed);
  }
  onMount(() => {
    origin = window.location.origin;
    refreshStatus();
  });
  // The subscription follows the player ID (personal notices).
  let lastId = userState.id;
  $effect(() => {
    const id = userState.id;
    if (id !== lastId) {
      lastId = id;
      if (subscribed) pushIsEnabled();
    }
  });
  $effect(() => {
    if (open) {
      refreshStatus();
      refreshQq();
    }
  });

  // QQ binding: { count } from the server, and the code just made.
  let qqBound = $state(0);
  let qqCode = $state(null);
  async function refreshQq() {
    if (!userState.id) return;
    try {
      qqBound = (await API.getQqBindings(userState.id)).data?.count || 0;
    } catch {
      qqBound = 0;
    }
  }
  async function makeCode() {
    if (busy || !userState.id) return;
    busy = true;
    try {
      qqCode = (await API.createQqBindCode(userState.id)).data;
    } catch (e) {
      toast.error(e.plain ? e.message : `获取绑定码失败: ${e.message}`);
    } finally {
      busy = false;
    }
  }
  let codeEl = $state(null);
  async function copyCommand(e) {
    if (await copyText(`绑定 ${qqCode.code}`, { near: e?.currentTarget })) {
      toast.success("已复制，在 QQ 群里 @土豆杯机器人 后粘贴发送");
    } else if (selectText(codeEl)) {
      // The browser refused: leave the command selected for a long press / ⌘C.
      toast.info("已选中绑定指令，请长按或按 ⌘C 复制");
    } else {
      toast.error("复制失败，请手动输入");
    }
  }
  async function unbind() {
    if (busy || !userState.id) return;
    busy = true;
    try {
      await API.deleteQqBindings(userState.id);
      qqBound = 0;
      qqCode = null;
      toast.info("已解除 QQ 绑定");
    } catch (e) {
      toast.error(e.plain ? e.message : `解除绑定失败: ${e.message}`);
    } finally {
      busy = false;
    }
  }

  const mine = $derived(Boolean(userState.id));
  const feed = $derived(origin ? calendarUrl(origin, userState.id) : "");
  const allFeed = $derived(origin ? calendarUrl(origin) : "");
  const count = $derived(reminders.items.length);

  async function copy(url, e) {
    if (await copyText(url, { near: e?.currentTarget })) toast.success("日历链接已复制，到日历 App 里选择「通过网址订阅」并粘贴");
    else toast.error("复制失败，请手动选择链接复制");
  }

  async function togglePush() {
    if (busy) return;
    busy = true;
    try {
      if (subscribed) {
        await disablePush();
        toast.info("已关闭浏览器通知");
      } else {
        await enablePush();
        toast.success("浏览器通知已开启，可以点「发送测试」确认能收到");
      }
    } catch (e) {
      toast.error(e.plain ? e.message : `${subscribed ? "关闭" : "开启"}浏览器通知失败: ${e.message}`);
    } finally {
      busy = false;
      await refreshStatus();
    }
  }

  async function test() {
    if (busy) return;
    busy = true;
    try {
      await sendTestPush();
      toast.success("测试通知已发出，几秒内没收到的话，这台设备可能收不到网页通知，建议订阅日历");
    } catch (e) {
      const why = {
        429: "请等一分钟再测试",
        410: "这个浏览器的通知已失效，请关闭后重新开启",
        502: "浏览器的推送服务没有接收这条通知，这台设备可能收不到网页通知，建议订阅日历",
      }[e.status];
      toast.error(why || (e.plain ? e.message : `发送测试通知失败: ${e.message}`));
    } finally {
      busy = false;
    }
  }

  const PUSH_TEXT = {
    on: "已开启：轮到你比赛、禁用、确认比分时会弹出系统通知。",
    off: "关闭网页时也能收到系统通知。",
    denied: "通知被浏览器拦截了，请在地址栏左侧的网站设置里允许通知后刷新页面。",
    "ios-install": "iPhone / iPad 需要先在 Safari 里点「分享 → 添加到主屏幕」，再从主屏幕图标打开本站，才能开启通知。",
    unsupported: "当前浏览器不支持网页通知。",
    insecure: "网页通知只能在 https 地址下使用，请用 https:// 打开本站。",
  };

  const section = "rounded-lg border border-border bg-background/60 p-3";
  const small = "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer";
  const main = "inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer";
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    id="header-push-toggle"
    title="比赛提醒"
    aria-label={count ? `比赛提醒（${count} 项待处理）` : "比赛提醒"}
    class="relative w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer
      {count ? 'text-brand-ink bg-primary/15 hover:bg-primary/20' : subscribed ? 'text-brand-ink bg-primary/10 hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
  >
    {#if count}<BellRingIcon class="h-4 w-4" />{:else}<BellIcon class="h-4 w-4" />{/if}
    {#if count}
      <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground">{count}</span>
    {/if}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-[min(22rem,calc(100vw-1.5rem))] gap-2.5 p-3">
    <div class="flex items-baseline justify-between gap-2">
      <p class="text-base font-black">比赛提醒</p>
      <p class="truncate text-small text-muted-foreground">{mine ? `选手：${userState.id}` : "未填写选手 ID"}</p>
    </div>

    <!-- Calendar -->
    <div class={section}>
      <div class="mb-1 flex items-center gap-2">
        <CalendarPlusIcon class="size-4 text-brand-ink" />
        <p class="flex-1 text-sm font-bold">{mine ? "订阅我的比赛日历" : "订阅赛事日历"}</p>
        <span class="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-ink">推荐</span>
      </div>
      <p class="text-small text-muted-foreground">
        {mine
          ? "你报名的比赛会出现在手机或电脑的日历里，开赛前 1 小时和 10 分钟由日历响铃；需要签到的比赛在签到开放时提醒。赛程变化会自动同步。"
          : "所有即将举行的赛事会出现在你的日历里，开赛前 1 小时响铃。填写选手 ID 后可以只订阅自己报名的比赛。"}
      </p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <a href={webcalUrl(feed)} class={main}><CalendarPlusIcon class="size-3.5" />添加到日历</a>
        <button type="button" class={small} onclick={(e) => copy(feed, e)}><CopyIcon class="size-3.5" />复制链接</button>
        <button type="button" class="{small} border-transparent bg-transparent text-muted-foreground" onclick={() => (help = !help)}>怎么添加？</button>
      </div>
      {#if help}
        <ul class="mt-2 list-disc space-y-0.5 pl-4 text-small text-muted-foreground">
          <li>iPhone / iPad / Mac：点「添加到日历」，在弹出的窗口里选「订阅」。</li>
          <li>安卓和其他日历 App：点「复制链接」，在日历 App 的设置里找「添加日历 → 通过网址订阅」并粘贴。</li>
          <li>Outlook：「添加日历 → 从 Internet 订阅」并粘贴链接。</li>
          <li>到时间没有响铃的话，检查日历订阅设置里是否关掉了「提醒」。</li>
          {#if mine}<li>只想看全部赛事？<button type="button" class="font-semibold text-brand-ink underline-offset-2 hover:underline cursor-pointer" onclick={(e) => copy(allFeed, e)}>复制全部赛事日历链接</button></li>{/if}
        </ul>
      {/if}
    </div>

    <!-- Browser notifications -->
    <div class={section}>
      <div class="mb-1 flex items-center gap-2">
        <BellIcon class="size-4 text-brand-ink" />
        <p class="flex-1 text-sm font-bold">浏览器通知</p>
        {#if status === "on"}<span class="inline-flex items-center gap-0.5 text-small font-bold text-brand-ink"><CheckIcon class="size-3.5" />已开启</span>{/if}
      </div>
      <p class="text-small text-muted-foreground">{PUSH_TEXT[status]}</p>
      {#if status === "on" || status === "off"}
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#if status === "on"}
            <button type="button" class={main} disabled={busy} onclick={test}>发送测试</button>
            <button type="button" class={small} disabled={busy} onclick={togglePush}>关闭通知</button>
          {:else}
            <button type="button" class={main} disabled={busy} onclick={togglePush}>开启通知</button>
          {/if}
        </div>
        <p class="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">部分国内安卓浏览器收不到网页通知，建议同时订阅日历。</p>
      {/if}
    </div>

    <!-- QQ group -->
    <div class={section}>
      <div class="mb-1 flex items-center gap-2">
        <MessageCircleIcon class="size-4 text-brand-ink" />
        <p class="flex-1 text-sm font-bold">QQ 群提醒</p>
        {#if mine && qqBound}<span class="inline-flex items-center gap-0.5 text-small font-bold text-brand-ink"><CheckIcon class="size-3.5" />已绑定</span>{/if}
      </div>
      <p class="text-small text-muted-foreground">群里的比赛就绪、确认比分、轮到禁用和开赛提醒会 @ 你个人资料里填写的 QQ 号。</p>
      {#if mine}
        <p class="mt-1 text-small text-muted-foreground">绑定后，在群里 @土豆杯机器人（或私聊它）发送「赛程」「报分」「确认」「战绩」等指令，不用打开网站就能查比赛、报比分。</p>
        {#if qqCode}
          <div class="mt-2 rounded-md bg-muted/60 p-2">
            <p class="text-small text-muted-foreground">10 分钟内在 QQ 群里 @土豆杯机器人 发送（私聊机器人也要绑定的话，再私聊发一次同样的内容）：</p>
            <p bind:this={codeEl} class="num mt-0.5 select-all text-lg font-black tracking-wide">绑定 {qqCode.code}</p>
          </div>
        {/if}
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#if qqCode}
            <button type="button" class={main} onclick={copyCommand}><CopyIcon class="size-3.5" />复制</button>
          {:else}
            <button type="button" class={main} disabled={busy} onclick={makeCode}>{qqBound ? "再绑定一个 QQ" : "获取绑定码"}</button>
          {/if}
          {#if qqBound}<button type="button" class={small} disabled={busy} onclick={unbind}>解除绑定</button>{/if}
        </div>
      {:else}
        <p class="mt-1 text-small text-muted-foreground">填写选手 ID 后可以绑定 QQ，在群里查询自己的赛程和战绩。</p>
      {/if}
    </div>

    <!-- On this site -->
    <div class={section}>
      <div class="mb-1 flex items-center gap-2">
        <MonitorIcon class="size-4 text-brand-ink" />
        <p class="flex-1 text-sm font-bold">网页内提醒</p>
      </div>
      <p class="text-small text-muted-foreground">
        {mine ? "开着本站时，轮到你操作会在页面顶部提示。" : "填写选手 ID 后，开着本站时轮到你操作会在页面顶部提示。"}
      </p>
      <div class="mt-2 flex flex-col gap-1.5 text-sm">
        <label class="flex cursor-pointer items-center gap-2">
          <input type="checkbox" class="size-4 accent-[var(--color-primary)]" checked={reminders.banner} onchange={(e) => reminders.setPrefs({ banner: e.currentTarget.checked })} />
          顶部横幅，后台时标签页标题闪烁
        </label>
        <label class="flex cursor-pointer items-center gap-2">
          <input type="checkbox" class="size-4 accent-[var(--color-primary)]" checked={reminders.sound} onchange={(e) => reminders.setPrefs({ sound: e.currentTarget.checked })} />
          提示音
        </label>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
