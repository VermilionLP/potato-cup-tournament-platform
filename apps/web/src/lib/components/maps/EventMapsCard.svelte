<script>
  // An event's 比赛地图 in its 说明 tab: the maps players make their rooms
  // with (copy link / download), in the order chosen. Admins pick them from
  // the maps on /maps. Nothing shows for others when the event has none.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MissionCard from "./MissionCard.svelte";
  import MissionHowTo from "./MissionHowTo.svelte";
  import MapIcon from "@lucide/svelte/icons/map";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";

  let { tournament } = $props();

  let isAdmin = $derived(!!userState.adminToken);
  let all = $state([]);
  let loaded = $state(false);
  let chosen = $state([]);
  let editing = $state(false);
  let draft = $state([]);
  let saving = $state(false);

  $effect(() => {
    chosen = [...(tournament?.missions || [])];
  });
  $effect(() => {
    if (loaded || !(chosen.length || isAdmin)) return;
    loaded = true;
    API.getMissions().then((r) => (all = r.missions || []), () => {});
  });

  const byId = $derived(new Map(all.map((m) => [m.id, m])));
  const shown = $derived(chosen.map((id) => byId.get(id)).filter(Boolean));

  function toggle(id) {
    draft = draft.includes(id) ? draft.filter((x) => x !== id) : [...draft, id];
  }
  function up(i) {
    if (i <= 0) return;
    const next = [...draft];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    draft = next;
  }
  async function save() {
    saving = true;
    try {
      chosen = (await API.setEventMissions(tournament.id, draft)).missions;
      editing = false;
      toast.success("已更新比赛地图");
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

{#if chosen.length || isAdmin}
  <Card.Root class="gap-0 py-0">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <span class="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-brand-ink"><MapIcon class="size-4" /></span>
      <h3 class="text-sm font-bold">比赛地图</h3>
      <a href="/maps" class="ml-auto text-small font-semibold text-muted-foreground hover:text-foreground">全部地图</a>
      {#if isAdmin && !editing}
        <Button size="sm" variant="outline" onclick={() => ((draft = [...chosen]), (editing = true))}><PencilIcon class="size-3.5" />选择地图</Button>
      {/if}
    </div>
    <div class="space-y-3 px-4 py-3.5">
      {#if editing}
        {#if !all.length}
          <p class="text-sm text-muted-foreground">还没有比赛地图。<a href="/maps" class="font-semibold text-brand-ink hover:underline">去添加地图</a></p>
        {:else}
          <p class="text-small text-muted-foreground">勾选这场比赛用的地图，按选中的顺序显示（最多 10 张）。</p>
          <ul class="divide-y divide-border rounded-lg border border-border">
            {#each [...draft.map((id) => byId.get(id)).filter(Boolean), ...all.filter((m) => !draft.includes(m.id))] as m (m.id)}
              {@const at = draft.indexOf(m.id)}
              <li class="flex items-center gap-2 px-3 py-2">
                <input type="checkbox" class="size-4 accent-primary" checked={at >= 0} onchange={() => toggle(m.id)} id="em-{m.id}" />
                <label for="em-{m.id}" class="min-w-0 flex-1 truncate text-sm font-semibold" data-no-i18n>{m.name}</label>
                {#if at > 0}<button type="button" class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="上移" onclick={() => up(at)}><ArrowUpIcon class="size-3.5" /></button>{/if}
              </li>
            {/each}
          </ul>
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="outline" onclick={() => (editing = false)}>取消</Button>
            <Button size="sm" onclick={save} disabled={saving}>保存</Button>
          </div>
        {/if}
      {:else if shown.length}
        <div class="grid gap-3 md:grid-cols-2">
          {#each shown as m (m.id)}<MissionCard mission={m} compact />{/each}
        </div>
        <details class="group">
          <summary class="cursor-pointer select-none text-small font-semibold text-brand-ink/90 hover:text-brand-ink">怎么用链接开房</summary>
          <MissionHowTo class="mt-2" />
        </details>
      {:else}
        <p class="text-sm text-muted-foreground">这场比赛还没有指定地图。</p>
      {/if}
    </div>
  </Card.Root>
{/if}
