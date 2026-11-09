<script>
  // Player list: search, recently active players first (your own entry on
  // top), inactive ones folded away. Table, cards and the edit dialog live
  // in #lib/components/players.
  import PageHeader from "#lib/components/PageHeader.svelte";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { filterPlayers, isRecentlySeen, mineFirst } from "#lib/players.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PlayerTable from "#lib/components/players/PlayerTable.svelte";
  import PlayerCards from "#lib/components/players/PlayerCards.svelte";
  import PlayerProfileDialog from "#lib/components/players/PlayerProfileDialog.svelte";
  import { lazy } from "#lib/lazy.js";

  // Admins: likely duplicate players to merge (loaded for admins only).
  const loadDuplicates = lazy(() => import("#lib/components/players/DuplicatePlayers.svelte"));
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";

  let players = $state([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let isAdmin = $derived(!!userState.adminToken);
  let dialog = $state(null);

  let filteredPlayers = $derived(filterPlayers(players, searchQuery));
  // Players not seen for over a year (no event, vote or visit) are folded
  // away so active players find themselves quickly. A search always looks
  // through everyone.
  let showInactive = $state(false);
  let activePlayers = $derived(mineFirst(filteredPlayers.filter((p) => isRecentlySeen(p)), userState.id));
  let inactivePlayers = $derived(filteredPlayers.filter((p) => !isRecentlySeen(p)));
  let searching = $derived(searchQuery.trim() !== "");
  let shownPlayers = $derived(searching || showInactive ? [...activePlayers, ...inactivePlayers] : activePlayers);
  let emptyText = $derived(searchQuery ? "没有找到符合条件的选手" : inactivePlayers.length ? "最近一年没有活跃选手" : "暂无选手数据");

  onMount(load);

  async function load() {
    loading = true;
    try {
      players = await API.listPlayers();
    } catch (e) {
      toast.error("加载选手列表失败: " + e.message);
    }
    loading = false;
  }

  async function onchanged({ removed } = {}) {
    if (removed) players = players.filter((p) => p.id !== removed);
    await load();
  }

  const openEdit = (p) => dialog?.openEdit(p);
</script>

<svelte:head><title>选手列表 · Potato Cup</title></svelte:head>

{#snippet listFooter()}
  <span>显示 {shownPlayers.length} / {players.length} 名选手</span>
  {#if inactivePlayers.length && !searching}
    <button
      type="button"
      onclick={() => (showInactive = !showInactive)}
      class="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline cursor-pointer"
    >
      {#if showInactive}
        <ChevronUpIcon class="w-3.5 h-3.5" />
        收起超过一年未活跃的 {inactivePlayers.length} 名选手
      {:else}
        <ChevronDownIcon class="w-3.5 h-3.5" />
        展开超过一年未活跃的 {inactivePlayers.length} 名选手
      {/if}
    </button>
  {/if}
{/snippet}

<div class="space-y-6">
  <PageHeader title="选手列表" icon={UsersIcon}>
    {#snippet description()}
      共 {players.length} 名选手（近一年活跃 {players.filter((p) => isRecentlySeen(p)).length} 名）
    {/snippet}
    {#snippet actions()}
      {#if isAdmin}
        <Button onclick={() => dialog?.openCreate()} class="gap-1.5 font-bold text-xs">
          <PlusIcon class="w-4 h-4" />
          新增选手
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  {#if isAdmin}
    {#await loadDuplicates() then m}
      <m.default onmerged={onchanged} />
    {/await}
  {/if}

  <div class="relative max-w-sm">
    <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="搜索 ID、显示名、战队..."
      class="w-full pl-9 pr-4 h-8 text-sm rounded-md bg-muted/40 border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none transition-all text-foreground placeholder:text-muted-foreground/60"
    />
  </div>

  {#if loading}
    <PageSkeleton kind="table" label="正在加载选手数据..." rows={10} />
  {:else}
    <PlayerTable players={shownPlayers} {isAdmin} {emptyText} onedit={openEdit} footer={filteredPlayers.length ? listFooter : null} />
    <PlayerCards players={shownPlayers} {isAdmin} {emptyText} onedit={openEdit} footer={filteredPlayers.length ? listFooter : null} />
  {/if}
</div>

<PlayerProfileDialog bind:this={dialog} {players} {isAdmin} {onchanged} />
