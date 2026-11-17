<script>
  // 黑桃过滤 on the 载具池 tab: whose spaded vehicles (Statshark) the server
  // has for this event, as Ban / Pick keeps only the vehicles both players
  // of a match have spaded (copies counted). Admins can fetch them now (the event's start does
  // it by itself) and see the requests left today.
  import { API } from "#lib/api.js";
  import { toast } from "svelte-sonner";
  import { Button } from "#lib/components/ui/button/index.js";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  let { tid, players = [], spaded = {}, statshark = false, isAdmin = false, onspaded } = $props();

  let busy = $state(false);
  let quota = $state(null);

  const rows = $derived(players.map((p) => ({ id: p.id, ...(spaded?.[p.id] || { linked: false, has: null }) })));
  const withData = $derived(rows.filter((r) => Array.isArray(r.has)));
  const noId = $derived(rows.filter((r) => !r.linked));
  const failed = $derived(rows.filter((r) => r.linked && r.error));
  const waiting = $derived(rows.filter((r) => r.linked && !Array.isArray(r.has) && !r.error));
  const latest = $derived(withData.map((r) => r.fetched_at).filter(Boolean).sort().at(-1));

  $effect(() => {
    if (isAdmin && statshark && quota === null) API.statsharkQuota().then((q) => (quota = q)).catch(() => {});
  });

  async function refresh() {
    busy = true;
    try {
      const r = await API.refreshSpaded(tid);
      const parts = [`已读取 ${r.fetched} 人`];
      if (r.failed) parts.push(`${r.failed} 人读取失败`);
      if (r.pending) parts.push(`${r.pending} 人因今日次数不够没有读取`);
      parts.push(`今天还剩 ${r.left} 次`);
      toast.success(parts.join("，"));
      quota = { ...(quota || {}), left: r.left };
      onspaded?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }
</script>

{#if statshark || rows.some((r) => r.linked)}
  <section class="mb-4 space-y-2 rounded-xl border border-border bg-card p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-bold">黑桃过滤（Statshark）</h3>
        <p class="text-small text-muted-foreground">
          Ban/Pick 只保留双方都有黑桃的载具，复制载具（载具池里的「复制自」）算同一辆；有一方没有数据、或两人没有共同的黑桃载具时，这场不过滤。选手在「个人资料」里填 Statshark ID，比赛开始时读取。
        </p>
      </div>
      {#if isAdmin && statshark}
        <div class="flex items-center gap-2">
          {#if quota?.left !== null && quota?.left !== undefined}<span class="text-small text-muted-foreground num">今天还剩 {quota.left} 次</span>{/if}
          <Button size="sm" variant="outline" onclick={refresh} disabled={busy || !rows.some((r) => r.linked)}>
            <RefreshCwIcon class="size-3.5 {busy ? 'animate-spin' : ''}" />现在读取
          </Button>
        </div>
      {/if}
    </div>
    <p class="text-small">
      <span class="font-semibold">{withData.length} / {rows.length}</span> 名选手有黑桃数据{#if latest}（最近读取 {new Date(latest).toLocaleString()}）{/if}
      {#if waiting.length}<span class="text-muted-foreground">；{waiting.length} 人等待读取</span>{/if}
    </p>
    {#if isAdmin && (noId.length || failed.length)}
      <details class="text-small text-muted-foreground">
        <summary class="cursor-pointer select-none font-semibold">没有数据的选手</summary>
        {#if noId.length}<p class="mt-1">没填 Statshark ID：{noId.map((r) => r.id).join("、")}</p>{/if}
        {#each failed as r (r.id)}<p class="mt-1">{r.id}：{r.error}</p>{/each}
      </details>
    {/if}
  </section>
{/if}
