<script>
  // 比赛地图: War Thunder mission files players use to make custom battle
  // rooms (自定义战斗 → Missions by URL). Everyone can copy the links and
  // download the files; admins add maps here and edit them on /maps/<id>.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageSkeleton from "#lib/components/PageSkeleton.svelte";
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MissionCard from "#lib/components/maps/MissionCard.svelte";
  import MissionHowTo from "#lib/components/maps/MissionHowTo.svelte";
  import MissionCreateDialog from "#lib/components/maps/MissionCreateDialog.svelte";
  import MapIcon from "@lucide/svelte/icons/map";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let isAdmin = $derived(!!userState.adminToken);
  let missions = $state([]);
  let loading = $state(true);
  let creating = $state(false);

  async function load() {
    try {
      missions = (await API.getMissions()).missions || [];
    } catch (e) {
      toast.error("加载比赛地图失败: " + e.message);
    } finally {
      loading = false;
    }
  }
  // Again when signing in or out as admin (hidden maps are for admins).
  let loadedAs = null;
  $effect(() => {
    if (loadedAs === isAdmin) return;
    loadedAs = isAdmin;
    load();
  });
</script>

<svelte:head><title>比赛地图 · Potato Cup</title></svelte:head>

<div class="mx-auto max-w-6xl space-y-5 px-4 py-6">
  <PageHeader title="比赛地图" icon={MapIcon} description="复制开房链接，在自定义战斗里用 Missions by URL 创建比赛房间。">
    {#snippet more()}
      <MissionHowTo class="mt-2" />
    {/snippet}
    {#snippet actions()}
      {#if isAdmin}<Button onclick={() => (creating = true)}><PlusIcon class="size-4" />添加地图</Button>{/if}
    {/snippet}
  </PageHeader>

  {#if loading}
    <PageSkeleton />
  {:else if !missions.length}
    <EmptyState icon={MapIcon} title="还没有比赛地图" hint={isAdmin ? "点右上角「添加地图」上传 .blk 文件或从链接导入。" : "管理员添加后会显示在这里。"} />
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each missions as m (m.id)}
        <MissionCard mission={m} />
      {/each}
    </div>
  {/if}
</div>

{#if isAdmin}<MissionCreateDialog bind:open={creating} />{/if}
