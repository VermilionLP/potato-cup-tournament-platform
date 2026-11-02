<script>
  // Admins: errors visitors' browsers ran into ($lib/error-report.js sends
  // them; the API keeps the newest 500, the same error counted on one row).
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { formatInZone } from "$lib/datetime.js";
  import BugIcon from "@lucide/svelte/icons/bug";

  let isAdmin = $derived(!!userState.adminToken);
  let errors = $state([]);
  let loading = $state(true);
  let open = $state(null); // id whose stack is shown
  let confirmClear = $state(false);

  async function load() {
    loading = true;
    try {
      errors = (await API.getClientErrors()).errors || [];
    } catch (e) {
      toast.error("加载失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function clear() {
    if (!confirmClear) {
      confirmClear = true;
      return;
    }
    confirmClear = false;
    try {
      await API.clearClientErrors();
      errors = [];
      toast.success("已清空");
    } catch (e) {
      toast.error(e.message);
    }
  }

  onMount(() => {
    if (isAdmin) load();
    else loading = false;
  });
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div class="space-y-1">
      <h1 class="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <BugIcon class="h-6 w-6 text-primary" />
        前端报错
      </h1>
      <p class="text-xs text-muted-foreground">访客浏览器里没处理的错误，同一个错误合并计数，只保留最近 500 条。</p>
    </div>
    {#if isAdmin}
      <div class="flex gap-2 text-xs">
        <button type="button" onclick={load} class="h-8 rounded-md border border-border px-3 font-semibold hover:bg-muted cursor-pointer">刷新</button>
        <button
          type="button"
          onclick={clear}
          disabled={!errors.length}
          class="h-8 rounded-md border px-3 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
            {confirmClear ? 'border-red-500 bg-red-500 text-white' : 'border-border hover:bg-muted'}"
        >{confirmClear ? "确认清空" : "清空"}</button>
      </div>
    {/if}
  </div>

  {#if !isAdmin}
    <p class="py-16 text-center text-sm text-muted-foreground">需要管理员权限，请先点击右上角盾牌图标登录。</p>
  {:else if loading}
    <p class="py-16 text-center text-xs text-muted-foreground">加载中...</p>
  {:else if !errors.length}
    <p class="py-16 text-center text-sm text-muted-foreground">没有报错。</p>
  {:else}
    <div class="divide-y divide-border/60 rounded-xl border border-border bg-card/40 text-xs">
      {#each errors as e (e.id)}
        <div class="space-y-1 px-4 py-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <button type="button" class="min-w-0 text-left font-mono font-semibold text-foreground break-all cursor-pointer hover:text-primary" onclick={() => (open = open === e.id ? null : e.id)}>
              {e.message}
            </button>
            <span class="shrink-0 rounded-full bg-muted px-2 py-0.5 font-bold">{e.count} 次</span>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>最近 {formatInZone(new Date(e.last_at))}</span>
            {#if e.count > 1}<span>首次 {formatInZone(new Date(e.first_at))}</span>{/if}
            {#if e.page}<a href={e.page} class="font-mono hover:text-primary">{e.page}</a>{/if}
            {#if e.player_id}<a href="/player/{encodeURIComponent(e.player_id)}" class="hover:text-primary">选手 {e.player_id}</a>{/if}
          </div>
          {#if open === e.id}
            <pre class="mt-1 max-h-64 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all">{e.stack || "（没有堆栈）"}</pre>
            <div class="text-[10px] text-muted-foreground break-all">{e.user_agent}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
