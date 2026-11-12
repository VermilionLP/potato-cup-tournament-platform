<script>
  // Admins: what admins changed (GET /admin/log, #lib/admin-log.js words
  // each row), newest first, by day. ?event=<id> shows one event (the link
  // in its settings dialog). Each row opens to the stored fields.
  import PageHeader from "#lib/components/PageHeader.svelte";
  import AdminTabs from "#lib/components/layout/AdminTabs.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { formatInZone } from "#lib/datetime.js";
  import { describeEntry, groupByDay } from "#lib/admin-log.js";
  import ShieldIcon from "@lucide/svelte/icons/shield";

  let isAdmin = $derived(!!userState.adminToken);
  let eventId = $derived(page.url.searchParams.get("event") || "");
  let entries = $state([]);
  let more = $state(false);
  let loading = $state(true);
  let loadingMore = $state(false);
  let open = $state(null); // id whose fields are shown

  async function load() {
    loading = true;
    try {
      const res = await API.getAdminLog({ tournament: eventId });
      entries = res.entries || [];
      more = Boolean(res.more);
    } catch (e) {
      toast.error("加载失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    loadingMore = true;
    try {
      const res = await API.getAdminLog({ tournament: eventId, before: entries.at(-1)?.id });
      entries = [...entries, ...(res.entries || [])];
      more = Boolean(res.more);
    } catch (e) {
      toast.error("加载失败: " + e.message);
    } finally {
      loadingMore = false;
    }
  }

  // "2026/11/14 周六 20:00" -> day and time.
  const when = (e) => formatInZone(new Date(e.at));
  let days = $derived(groupByDay(entries, (e) => when(e).slice(0, -6)));
  let eventName = $derived(eventId ? entries.find((e) => e.tournament_name)?.tournament_name || eventId : "");

  let loadedFor = $state(null);
  $effect(() => {
    if (!isAdmin || loadedFor === eventId) return;
    loadedFor = eventId;
    load();
  });
  onMount(() => {
    if (!isAdmin) loading = false;
  });
</script>

<svelte:head><title>操作记录 · 管理 · Potato Cup</title></svelte:head>

<div class="space-y-4">
  <div class="space-y-3">
  <PageHeader title="管理" icon={ShieldIcon} description="管理员做过的修改：比分、弃权、赛事设置、选手和载具池。记录的是当时浏览器登录的选手 ID。">
    {#snippet actions()}
      {#if isAdmin}
        <button type="button" onclick={load} class="h-8 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted cursor-pointer">刷新</button>
      {/if}
    {/snippet}
  </PageHeader>
  {#if isAdmin}<AdminTabs />{/if}
  </div>

  {#if eventId}
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="rounded-full bg-primary/12 px-2.5 py-1 font-semibold text-brand-ink">只看：{eventName}</span>
      <a href="/tournament/{encodeURIComponent(eventId)}" class="text-muted-foreground hover:text-brand-ink">打开赛事</a>
      <button type="button" class="text-muted-foreground hover:text-brand-ink cursor-pointer" onclick={() => goto("/log")}>查看全部</button>
    </div>
  {/if}

  {#if !isAdmin}
    <p class="py-16 text-center text-sm text-muted-foreground">需要管理员权限，请先点击右上角盾牌图标登录。</p>
  {:else if loading}
    <p class="py-16 text-center text-xs text-muted-foreground">加载中...</p>
  {:else if !entries.length}
    <p class="py-16 text-center text-sm text-muted-foreground">还没有操作记录。</p>
  {:else}
    {#each days as group (group.day)}
      <section class="space-y-1.5">
        <h2 class="text-small font-bold text-muted-foreground">{group.day}</h2>
        <div class="divide-y divide-border/60 rounded-xl border border-border bg-card/40">
          {#each group.entries as e (e.id)}
            <div class="px-4 py-2.5 text-sm">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <button type="button" class="flex min-w-0 flex-1 items-baseline gap-3 text-left cursor-pointer hover:text-brand-ink" onclick={() => (open = open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                  <span class="num w-11 shrink-0 text-small text-muted-foreground">{when(e).slice(-5)}</span>
                  <span class="min-w-0 flex-1 font-medium">{describeEntry(e)}</span>
                </button>
                {#if !eventId && e.tournament_name}
                  <a href="/log?event={encodeURIComponent(e.tournament_id)}" class="shrink-0 text-small text-muted-foreground hover:text-brand-ink">{e.tournament_name}</a>
                {/if}
                <span class="shrink-0 text-small {e.actor ? 'font-semibold text-foreground/80' : 'text-muted-foreground'}">{e.actor || "未设置选手 ID"}</span>
              </div>
              {#if open === e.id}
                <pre class="mt-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-2 text-small leading-relaxed whitespace-pre-wrap break-all" data-no-i18n>{JSON.stringify(e.detail, null, 2)}</pre>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
    {#if more}
      <div class="text-center">
        <button type="button" disabled={loadingMore} onclick={loadMore} class="h-8 rounded-md border border-border px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50 cursor-pointer">
          {loadingMore ? "加载中..." : "加载更早的记录"}
        </button>
      </div>
    {/if}
  {/if}
</div>
