<script>
  // Admins, in a player's edit dialog (关联账号 tab): what Statshark gave
  // for this player — when it was read, the error if the last read failed,
  // and the spaded vehicles (Statshark's unit ids, searchable) — and reading
  // it again now (one request of the day's).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  let { playerId, savedId = "" } = $props();

  let data = $state(null);
  let busy = $state(false);
  let q = $state("");

  $effect(() => {
    const id = playerId;
    data = null;
    q = "";
    API.playerSpaded(id)
      .then((r) => playerId === id && (data = r))
      .catch(() => {});
  });

  const shown = $derived((data?.units || []).filter((u) => !q.trim() || u.includes(q.trim().toLowerCase().replace(/[^a-z0-9]/g, ""))));

  async function refresh() {
    busy = true;
    try {
      data = await API.refreshPlayerSpaded(playerId);
      if (data.error) toast.error(`读取失败：${data.error}`);
      else toast.success(`读取到 ${data.units?.length ?? 0} 辆黑桃载具，今天还剩 ${data.left} 次`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }
</script>

{#if savedId}
  <div class="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-small">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs font-bold">Statshark 读取结果</span>
      <Button variant="outline" size="sm" class="h-7 gap-1 text-xs" onclick={refresh} disabled={busy}>
        <RefreshCwIcon class="h-3.5 w-3.5 {busy ? 'animate-spin' : ''}" />现在读取
      </Button>
    </div>
    {#if !data}
      <p class="text-muted-foreground">正在加载...</p>
    {:else}
      <p>
        {#if Array.isArray(data.units)}
          已读取 <span class="font-semibold">{data.units.length}</span> 辆黑桃载具{#if data.fetched_at}（{new Date(data.fetched_at).toLocaleString()}）{/if}
        {:else}
          <span class="text-muted-foreground">还没有读取过，赛事开始时或点「现在读取」读取。</span>
        {/if}
      </p>
      {#if data.error}<p class="text-loss">上次读取失败：{data.error}</p>{/if}
      {#if data.units?.length}
        <input class="h-8 w-full rounded-md border border-border bg-background px-2 text-xs" bind:value={q} placeholder="搜索载具 ID，例如 f15e" />
        <div class="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {#each shown as u (u)}<span class="num rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{u}</span>{/each}
          {#if !shown.length}<span class="text-muted-foreground">没有匹配的载具</span>{/if}
        </div>
        <p class="text-muted-foreground/70">这里是 Statshark 的载具 ID（去掉了符号）；载具池里的载具 ID 或「复制自」要能对上这些，Ban/Pick 才会过滤。</p>
      {/if}
    {/if}
  </div>
{:else}
  <p class="text-small text-muted-foreground">填好 Statshark ID 并保存后，这里会显示读取结果。</p>
{/if}
