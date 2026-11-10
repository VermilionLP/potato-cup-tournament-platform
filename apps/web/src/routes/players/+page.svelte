<script>
  // Player list, for finding people: search, nationality and team filters,
  // recently active players first (your own entry on top), inactive ones
  // folded away; a row opens the player's page. Rankings are in 排行. Table, cards and the edit dialog live
  // in #lib/components/players.
  import PageHeader from "#lib/components/PageHeader.svelte";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { onMount } from "svelte";
  import { PAGE_SIZE } from "#lib/expand-row.js";
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

  // Nationality and team ("" = all), from the players present.
  let nation = $state("");
  let team = $state("");
  const countBy = (list, key) => {
    const m = new Map();
    for (const p of list) if (p[key]) m.set(p[key], (m.get(p[key]) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  let nations = $derived(countBy(players, "flag"));
  let teams = $derived(countBy(players, "team"));
  let filteredPlayers = $derived(
    filterPlayers(players, searchQuery).filter((p) => (!nation || p.flag === nation) && (!team || p.team === team)),
  );
  // Players not seen for over a year (no event, vote or visit) are folded
  // away so active players find themselves quickly. A search always looks
  // through everyone.
  let showInactive = $state(false);
  let activePlayers = $derived(mineFirst(filteredPlayers.filter((p) => isRecentlySeen(p)), userState.id));
  let inactivePlayers = $derived(filteredPlayers.filter((p) => !isRecentlySeen(p)));
  let searching = $derived(searchQuery.trim() !== "" || Boolean(nation || team));
  let shownPlayers = $derived(searching || showInactive ? [...activePlayers, ...inactivePlayers] : activePlayers);
  // 30 at a time (#lib/expand-row.js PAGE_SIZE); a new search starts over.
  let limit = $state(PAGE_SIZE);
  $effect(() => {
    searchQuery;
    nation;
    team;
    limit = PAGE_SIZE;
  });
  let pagedPlayers = $derived(shownPlayers.slice(0, limit));
  let emptyText = $derived(searchQuery || nation || team ? "没有找到符合条件的选手" : inactivePlayers.length ? "最近一年没有活跃选手" : "暂无选手数据");

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

<svelte:head><title>选手 · Potato Cup</title></svelte:head>

{#snippet listFooter()}
  <span class="inline-flex flex-wrap items-center gap-3">
    <span>显示 {pagedPlayers.length} / {shownPlayers.length} 名选手</span>
    {#if shownPlayers.length > pagedPlayers.length}
      <button type="button" onclick={() => (limit += PAGE_SIZE)} class="font-semibold text-brand-ink hover:underline cursor-pointer">
        再显示 {Math.min(PAGE_SIZE, shownPlayers.length - pagedPlayers.length)} 名
      </button>
      <button type="button" onclick={() => (limit = Infinity)} class="text-muted-foreground hover:text-foreground hover:underline cursor-pointer">全部显示</button>
    {/if}
  </span>
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
  <PageHeader title="选手" icon={UsersIcon}>
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

  <!-- Find a player: search, nationality, team -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative w-full sm:w-72">
      <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="搜索 ID、显示名、战队..."
        class="field w-full pl-9 pr-4 bg-muted/40 placeholder:text-muted-foreground/60"
      />
    </div>
    <select bind:value={nation} aria-label="国籍" class="field bg-muted/40 cursor-pointer {nation ? 'font-bold text-brand-ink' : 'text-muted-foreground'}">
      <option value="">全部国籍</option>
      {#each nations as [code, n] (code)}
        <option value={code}>{String(code).toUpperCase()} · {n}</option>
      {/each}
    </select>
    {#if teams.length}
      <select bind:value={team} aria-label="战队" class="field max-w-48 bg-muted/40 cursor-pointer {team ? 'font-bold text-brand-ink' : 'text-muted-foreground'}">
        <option value="">全部战队</option>
        {#each teams as [name, n] (name)}
          <option value={name}>{name} · {n}</option>
        {/each}
      </select>
    {/if}
    {#if nation || team}
      <button type="button" class="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline cursor-pointer" onclick={() => ((nation = ""), (team = ""))}>清除筛选</button>
    {/if}
  </div>

  {#if loading}
    <PageSkeleton kind="table" label="正在加载选手数据..." rows={10} />
  {:else}
    <PlayerTable players={pagedPlayers} {isAdmin} {emptyText} onedit={openEdit} footer={filteredPlayers.length ? listFooter : null} />
    <PlayerCards players={pagedPlayers} {isAdmin} {emptyText} onedit={openEdit} footer={filteredPlayers.length ? listFooter : null} />
  {/if}
</div>

<PlayerProfileDialog bind:this={dialog} {players} {isAdmin} {onchanged} />
