<script>
  // Admins: the admin panel. Matches waiting for an admin (disputed scores,
  // walkover claims; #lib/admin-pending.svelte.js), which admins are told
  // about them (browser notification + @ in the QQ group), and the database
  // backups the server keeps (scripts/backup-db.sh; apps/api/lib/
  // backup-status.js): the newest, whether the daily one runs, a check that
  // a dump reads back, and a backup on demand.
  import PageHeader from "#lib/components/PageHeader.svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { formatInZone } from "#lib/datetime.js";
  import { adminPending } from "#lib/admin-pending.svelte.js";
  import { pendingHref, pendingText } from "#lib/admin-pending.js";
  import { backupAge, formatBytes } from "#lib/backup-view.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import GaugeIcon from "@lucide/svelte/icons/gauge";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import BellRingIcon from "@lucide/svelte/icons/bell-ring";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import XIcon from "@lucide/svelte/icons/x";

  let isAdmin = $derived(!!userState.adminToken);
  let pending = $derived(adminPending.items);

  // Who is alerted.
  let alertList = $state([]);
  let alertMax = $state(10);
  let alertDraft = $state("");
  let alertBusy = $state(false);
  async function loadAlerts() {
    try {
      const res = await API.getAlertPlayers();
      alertList = res.players || [];
      alertMax = res.max || 10;
    } catch (e) {
      toast.error("加载失败: " + e.message);
    }
  }
  async function saveAlerts(next) {
    alertBusy = true;
    try {
      alertList = (await API.setAlertPlayers(next)).players || [];
      alertDraft = "";
      toast.success("已保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      alertBusy = false;
    }
  }
  const addAlert = () => {
    const id = alertDraft.trim();
    if (id && !alertList.includes(id)) saveAlerts([...alertList, id]);
  };

  // Backups.
  let backups = $state(null);
  let backupError = $state("");
  let verifying = $state("");
  let verified = $state({}); // file -> { ok, tables, error }
  let running = $state(false);
  async function loadBackups() {
    try {
      backups = await API.getBackups();
      backupError = "";
    } catch (e) {
      backupError = e.message;
    }
  }
  async function verify(file) {
    verifying = file;
    try {
      verified = { ...verified, [file]: await API.verifyBackup(file) };
    } catch (e) {
      verified = { ...verified, [file]: { ok: false, error: e.message } };
    } finally {
      verifying = "";
    }
  }
  async function backupNow() {
    running = true;
    try {
      const res = await API.runBackup();
      backups = res.status || backups;
      if (res.ok) toast.success("备份完成");
      else toast.error("备份失败: " + (res.output || ""));
    } catch (e) {
      toast.error("备份失败: " + e.message);
    } finally {
      running = false;
    }
  }

  let loaded = false;
  $effect(() => {
    if (!isAdmin || loaded) return;
    loaded = true;
    loadAlerts();
    loadBackups();
    adminPending.poll();
  });

  const when = (iso) => (iso ? formatInZone(new Date(iso)) : "");
</script>

<svelte:head><title>管理面板 · Potato Cup</title></svelte:head>

{#snippet head(Icon, title, hint = "")}
  <div class="flex items-start gap-2.5 border-b border-border px-5 py-3.5">
    <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><Icon class="size-4" /></span>
    <div class="min-w-0">
      <h2 class="text-sm font-bold">{title}</h2>
      {#if hint}<p class="mt-0.5 text-small text-muted-foreground">{hint}</p>{/if}
    </div>
  </div>
{/snippet}

<div class="space-y-5">
  <PageHeader title="管理面板" icon={GaugeIcon} description="等待处理的比赛、谁会收到提醒，以及数据库备份。" />

  {#if !isAdmin}
    <p class="py-16 text-center text-sm text-muted-foreground">需要管理员权限，请先点击右上角盾牌图标登录。</p>
  {:else}
    <Card.Root class="gap-0 py-0">
      {@render head(TriangleAlertIcon, "等待管理员处理", "比分有异议、选手申报对手弃权的比赛。到赛事的比赛日控制台裁决。")}
      {#if !pending.length}
        <p class="px-5 py-6 text-center text-sm text-muted-foreground">现在没有需要处理的比赛。</p>
      {:else}
        <div class="divide-y divide-border/60">
          {#each pending as i (i.match_id)}
            <a href={pendingHref(i)} class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-3 text-sm hover:bg-muted/50">
              <span class="font-semibold {i.kind === 'dispute' ? 'text-red-600 dark:text-red-400' : 'text-brand-ink'}">{i.kind === "dispute" ? "异议" : "弃权申报"}</span>
              <span class="min-w-0 flex-1">{pendingText(i)}</span>
              <span class="text-small text-muted-foreground">{i.tournament} · {when(i.at)}</span>
            </a>
          {/each}
        </div>
      {/if}
    </Card.Root>

    <Card.Root class="gap-0 py-0">
      {@render head(BellRingIcon, "提醒哪些管理员", "有异议或弃权申报时，这些选手 ID 会收到浏览器通知（需要在铃铛里开启），社区机器人在 QQ 群里 @ 他们（用选手资料里的 QQ 号）。不设置时群里照样提醒，只是不 @ 人。")}
      <div class="space-y-3 px-5 py-4">
        <div class="flex flex-wrap gap-1.5">
          {#each alertList as id (id)}
            <span class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs font-semibold">
              {id}
              <button type="button" class="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" aria-label="移除 {id}" disabled={alertBusy} onclick={() => saveAlerts(alertList.filter((x) => x !== id))}><XIcon class="size-3" /></button>
            </span>
          {:else}
            <span class="text-small text-muted-foreground">还没有设置。</span>
          {/each}
        </div>
        {#if alertList.length < alertMax}
          <form class="flex gap-2" onsubmit={(e) => (e.preventDefault(), addAlert())}>
            <input bind:value={alertDraft} placeholder="选手 ID，如 Vermilion" class="field max-w-64 flex-1" maxlength="100" />
            <Button type="submit" size="sm" variant="outline" disabled={alertBusy || !alertDraft.trim()}>添加</Button>
            {#if userState.id && !alertList.includes(userState.id)}
              <Button type="button" size="sm" variant="ghost" disabled={alertBusy} onclick={() => saveAlerts([...alertList, userState.id])}>添加我自己</Button>
            {/if}
          </form>
        {/if}
      </div>
    </Card.Root>

    <Card.Root class="gap-0 py-0">
      {@render head(DatabaseIcon, "数据库备份", "服务器上 scripts/backup-db.sh 写的备份：每次部署前一份，开启每日备份后每天凌晨一份。")}
      <div class="space-y-4 px-5 py-4 text-sm">
        {#if backupError}
          <p class="text-destructive">读取失败：{backupError}</p>
        {:else if !backups}
          <p class="text-muted-foreground">加载中…</p>
        {:else}
          {#if !backups.readable}
            <p class="rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">读不到备份目录 <code class="num">{backups.dir}</code>：还没有备份过，或者网站和备份不在同一台服务器。</p>
          {:else if backups.stale}
            <p class="rounded-md bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
              {backups.latest ? `最近一次备份在 ${backupAge(backups.latest.at)}，已经超过 36 小时。` : "还没有任何备份。"}
            </p>
          {/if}
          <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt class="text-small font-semibold text-muted-foreground">最近一次备份</dt>
              <dd class="mt-0.5 font-bold">{backups.latest ? `${when(backups.latest.at)}（${backupAge(backups.latest.at)}）` : "无"}</dd>
            </div>
            <div>
              <dt class="text-small font-semibold text-muted-foreground">每日自动备份</dt>
              <dd class="mt-0.5 font-bold">
                {#if backups.cron === true}已开启{:else if backups.cron === false}<span class="text-red-600 dark:text-red-400">未开启</span>{:else}无法确认{/if}
              </dd>
            </div>
            <div>
              <dt class="text-small font-semibold text-muted-foreground">保留的备份</dt>
              <dd class="mt-0.5 font-bold num">{backups.count} 份</dd>
            </div>
          </dl>
          {#if backups.cron === false}
            <p class="text-small text-muted-foreground">在服务器上运行一次即可开启（每天 4:17 备份，保留 14 份）：<code class="num rounded bg-muted px-1.5 py-0.5" data-no-i18n>bash /home/admin/suck/scripts/backup-db.sh --install-cron</code></p>
          {/if}
          {#if backups.recent?.length}
            <div class="divide-y divide-border/60 rounded-lg border border-border">
              {#each backups.recent as b (b.file)}
                {@const v = verified[b.file]}
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                  <span class="num min-w-0 flex-1 truncate" data-no-i18n>{b.file}</span>
                  <span class="text-muted-foreground num">{formatBytes(b.size)}</span>
                  {#if v}
                    <span class="font-semibold {v.ok ? 'text-green-600 dark:text-win' : 'text-destructive'}">{v.ok ? `可以恢复 · ${v.tables} 张表` : v.error}</span>
                  {:else}
                    <button type="button" class="font-semibold text-brand-ink hover:underline disabled:opacity-50 cursor-pointer" disabled={Boolean(verifying)} onclick={() => verify(b.file)}>{verifying === b.file ? "检查中…" : "检查能否恢复"}</button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" onclick={backupNow} disabled={running}>{running ? "备份中…" : "立即备份"}</Button>
            <Button size="sm" variant="outline" onclick={loadBackups} disabled={running}>刷新</Button>
            <span class="text-small text-muted-foreground">「检查能否恢复」只读取备份内容，不会改动数据库。</span>
          </div>
        {/if}
      </div>
    </Card.Root>
  {/if}
</div>
