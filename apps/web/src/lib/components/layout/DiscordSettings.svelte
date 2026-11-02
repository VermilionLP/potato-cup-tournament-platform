<script>
  // Discord announcements (admins, in the admin dialog): the webhook
  // address, the site address for links, which announcements go out, and a
  // test message. The stored webhook is never sent back, only masked.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let settings = $state(null);
  let webhook = $state("");
  let siteUrl = $state("");
  let events = $state({});
  let busy = $state(false);
  let expanded = $state(false);

  const KINDS = [
    ["registration", "开放报名"],
    ["start", "对阵生成 / 开赛"],
    ["result", "每场结果"],
    ["champion", "冠军"],
  ];

  async function load() {
    try {
      settings = await API.getDiscordSettings();
      siteUrl = settings.site_url || (typeof window !== "undefined" ? window.location.origin : "");
      events = { ...settings.events };
      webhook = "";
    } catch (e) {
      toast.error("读取 Discord 设置失败: " + e.message);
    }
  }

  onMount(load);

  async function save(extra = {}) {
    busy = true;
    try {
      const body = { site_url: siteUrl.trim(), events, ...extra };
      if (webhook.trim()) body.webhook_url = webhook.trim();
      settings = await API.saveDiscordSettings(body);
      webhook = "";
      toast.success("Discord 设置已保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }

  async function test() {
    busy = true;
    try {
      if (webhook.trim()) await save();
      await API.testDiscord();
      toast.success("测试消息已发送，请到 Discord 频道查看");
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }

  function remove() {
    if (confirm("删除 Webhook 地址并停止 Discord 播报？")) save({ webhook_url: "" });
  }
</script>

<div class="rounded-lg border border-border/70 p-3 space-y-2 text-xs">
  <button type="button" onclick={() => (expanded = !expanded)} class="flex w-full items-center justify-between font-bold cursor-pointer">
    <span>Discord 自动播报</span>
    <span class="text-[10px] font-normal {settings?.configured ? 'text-emerald-500' : 'text-muted-foreground'}">
      {settings?.configured ? "已开启" : "未设置"} {expanded ? "▲" : "▼"}
    </span>
  </button>
  {#if expanded && settings}
    <div class="space-y-1">
      <label for="discord-webhook" class="text-[11px] text-muted-foreground">Webhook 地址（Discord 频道设置 → 整合 → Webhooks）</label>
      <Input
        id="discord-webhook"
        type="password"
        bind:value={webhook}
        placeholder={settings.configured ? `已保存：${settings.webhook_masked}（留空不变）` : "https://discord.com/api/webhooks/..."}
        autocomplete="off"
        class="h-8 text-xs"
      />
    </div>
    <div class="space-y-1">
      <label for="discord-site" class="text-[11px] text-muted-foreground">网站地址（消息里的赛事链接）</label>
      <Input id="discord-site" bind:value={siteUrl} placeholder="https://..." class="h-8 text-xs" />
    </div>
    <div class="flex flex-wrap gap-x-3 gap-y-1">
      {#each KINDS as [key, label] (key)}
        <label class="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" bind:checked={events[key]} class="accent-primary" />
          {label}
        </label>
      {/each}
    </div>
    <p class="text-[10px] text-muted-foreground">
      服务器在中国大陆时一般连不上 Discord：请先点「发送测试」。不通的话，可以填一个海外中转地址（转发到 Discord Webhook 的 https 地址）。
    </p>
    <div class="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onclick={() => save()} class="h-7 text-xs">保存</Button>
      <Button size="sm" variant="outline" disabled={busy || (!settings.configured && !webhook.trim())} onclick={test} class="h-7 text-xs">发送测试</Button>
      {#if settings.configured}
        <Button size="sm" variant="ghost" disabled={busy} onclick={remove} class="h-7 text-xs text-destructive">删除 Webhook</Button>
      {/if}
    </div>
  {/if}
</div>
