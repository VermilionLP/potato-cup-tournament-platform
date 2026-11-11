<script>
  // Admins' editor of the season's Top 20 (/top): start from the points
  // ranking, reorder, add or remove players, and set when the reveal
  // starts (Beijing time; one place a day from the last). Places already
  // revealed are locked, and so are the size and the start once it began
  // (apps/api/lib/season-top.js changeProblem).
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { toInstant } from "#lib/datetime.js";
  import { TOP_SIZE, beijingValue, dayText, isLocked, move, revealDate } from "#lib/season-top.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import DateTimePicker from "#lib/components/DateTimePicker.svelte";
  import Flag from "#lib/components/Flag.svelte";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import XIcon from "@lucide/svelte/icons/x";
  import LockIcon from "@lucide/svelte/icons/lock";
  import WandIcon from "@lucide/svelte/icons/wand-sparkles";

  let { season, data, onchanged } = $props();

  let list = $state([]);
  let start = $state("");
  let adding = $state("");
  let saving = $state(false);

  // A newly loaded Top 20: start over from what's saved.
  $effect(() => {
    const loaded = data;
    untrack(() => {
      list = [...(loaded?.admin?.ranking || [])];
      start = beijingValue(loaded?.start_at);
      adding = "";
    });
  });

  let revealed = $derived(data?.revealed?.length || 0);
  let started = $derived(revealed > 0);
  let candidates = $derived(data?.admin?.candidates || []);
  let unused = $derived(candidates.filter((c) => !list.some((p) => p.id === c.id)));
  let dirty = $derived(
    JSON.stringify(list.map((p) => p.id)) !== JSON.stringify((data?.admin?.ranking || []).map((p) => p.id)) ||
      start !== beijingValue(data?.start_at),
  );
  let firstDay = $derived(start && list.length ? dayText(revealDate(toInstant(start), list.length, list.length)) : "");
  let lastDay = $derived(start && list.length ? dayText(revealDate(toInstant(start), 1, list.length)) : "");
  let clock = $derived(start ? start.slice(11, 16) : "");

  const pointsText = (p) => (p.points ? `${p.points.total} 分` : "无积分");

  function fromPoints() {
    list = [...(data?.admin?.suggested || [])];
  }
  function add() {
    const id = adding.trim();
    if (!id || list.length >= TOP_SIZE) return;
    if (list.some((p) => p.id === id)) {
      toast.error(`${id} 已经在名单里`);
      return;
    }
    list = [...list, candidates.find((c) => c.id === id) || { id, name: id, flag: "", points: null }];
    adding = "";
  }

  async function save() {
    saving = true;
    try {
      await API.saveSeasonTop(season, { ranking: list.map((p) => p.id), start_at: start ? toInstant(start)?.toISOString() : null });
      toast.success("年度 Top20 已保存");
      await onchanged?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      saving = false;
    }
  }
</script>

<section class="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="flex items-center gap-1.5 text-sm font-bold"><ShieldIcon class="h-4 w-4 text-brand-ink" />管理 {season} 年度 Top20</h2>
    {#if !started}
      <Button size="sm" variant="outline" onclick={fromPoints} disabled={!data?.admin?.suggested?.length} class="h-7 gap-1 text-xs">
        <WandIcon class="h-3.5 w-3.5" />按年度积分排名生成
      </Button>
    {/if}
  </div>
  <p class="text-small text-muted-foreground">
    系统按本赛季各类型积分之和排名，可以在揭晓前调整顺序或换人。揭晓开始后，已揭晓的名次、人数和开始时间都不能再改；还没揭晓的名次仍然可以调整。只有管理员能看到完整名单。
  </p>

  <ol class="divide-y divide-border/50 rounded-lg border border-border bg-background/60">
    {#each list as p, i (p.id)}
      {@const locked = isLocked(i, list.length, revealed)}
      <li class="flex items-center gap-2 px-2 py-1.5 text-xs">
        <span class="num w-7 shrink-0 text-right font-black {i < 3 ? 'text-amber-500' : 'text-muted-foreground'}">#{i + 1}</span>
        <Flag code={p.flag} size={14} />
        <span class="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
        <span class="num shrink-0 text-muted-foreground">{pointsText(p)}</span>
        {#if locked}
          <span class="inline-flex shrink-0 items-center gap-1 text-small text-muted-foreground"><LockIcon class="h-3 w-3" />已揭晓</span>
        {:else}
          <span class="flex shrink-0 gap-0.5">
            <button type="button" aria-label="上移" disabled={i === 0} onclick={() => (list = move(list, i, -1))} class="rounded p-1 hover:bg-muted disabled:opacity-30 cursor-pointer"><ArrowUpIcon class="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="下移" disabled={isLocked(i + 1, list.length, revealed) || i === list.length - 1} onclick={() => (list = move(list, i, 1))} class="rounded p-1 hover:bg-muted disabled:opacity-30 cursor-pointer"><ArrowDownIcon class="h-3.5 w-3.5" /></button>
            {#if !started}
              <button type="button" aria-label="移出名单" onclick={() => (list = list.filter((x) => x.id !== p.id))} class="rounded p-1 text-destructive hover:bg-destructive/10 cursor-pointer"><XIcon class="h-3.5 w-3.5" /></button>
            {/if}
          </span>
        {/if}
      </li>
    {:else}
      <li class="px-3 py-4 text-center text-small text-muted-foreground">名单是空的：点「按年度积分排名生成」，或在下面逐个添加选手。</li>
    {/each}
  </ol>

  {#if !started && list.length < TOP_SIZE}
    <div class="flex flex-wrap items-center gap-2">
      <Input bind:value={adding} list="top-candidates" placeholder="选手 ID" class="h-8 max-w-56 bg-background text-xs" onkeydown={(e) => e.key === "Enter" && add()} />
      <datalist id="top-candidates">
        {#each unused as c (c.id)}<option value={c.id}>{c.name} · {pointsText(c)}</option>{/each}
      </datalist>
      <Button size="sm" variant="outline" onclick={add} disabled={!adding.trim()} class="h-8 text-xs">添加到第 {list.length + 1} 名</Button>
    </div>
  {/if}

  <div class="space-y-1">
    <span class="text-small font-semibold text-muted-foreground">揭晓开始时间（北京时间，这一刻揭晓最后一名）</span>
    {#if started}
      <p class="text-xs">{start.replace("T", " ")}（已开始，不能再改）</p>
    {:else}
      <div class="max-w-72"><DateTimePicker bind:value={start} placeholder="不设置（先不公布）" /></div>
    {/if}
    {#if firstDay && lastDay}
      <p class="text-small text-muted-foreground">
        {firstDay} 揭晓第 {list.length} 名，之后每天 {clock} 揭晓一位，{lastDay} 揭晓第 1 名。每次揭晓 QQ 群机器人会发公告并 @ 这位选手。
      </p>
    {/if}
  </div>

  <div class="flex justify-end">
    <Button size="sm" onclick={save} disabled={saving || !dirty || !list.length}>{saving ? "保存中..." : "保存"}</Button>
  </div>
</section>
