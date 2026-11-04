<script>
  // Starting an event that asks for check-in: the admin decides, per player
  // who did not check in, to remove them (seeds and bracket are rebuilt),
  // keep them as forfeited (all their matches are walkovers), or keep them.
  // start() opens it; onstarted() after the event started.
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Flag from "#lib/components/Flag.svelte";

  let { tid, tournament, onstarted } = $props();

  let open = $state(false);
  let busy = $state(false);
  let choice = $state({}); // player id -> "remove" | "forfeit" | "keep"

  let absent = $derived((tournament?.players || []).filter((p) => !p.checked_in_at));
  let remaining = $derived((tournament?.players?.length || 0) - absent.filter((p) => choice[p.id] === "remove").length);

  export function start() {
    choice = Object.fromEntries(absent.map((p) => [p.id, "remove"]));
    open = true;
  }

  function setAll(value) {
    choice = Object.fromEntries(absent.map((p) => [p.id, value]));
  }

  async function confirmStart() {
    const ids = (value) => absent.filter((p) => choice[p.id] === value).map((p) => p.id);
    busy = true;
    try {
      const res = await API.startEvent(tid, { remove: ids("remove"), forfeit: ids("forfeit") });
      const parts = [];
      if (res.removed?.length) parts.push(`移出 ${res.removed.length} 人`);
      if (res.forfeited?.length) parts.push(`${res.forfeited.length} 人判弃权`);
      toast.success(`比赛已开始${parts.length ? `（${parts.join("，")}）` : ""}`);
      open = false;
      await onstarted?.(res);
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }

  const OPTIONS = [
    ["remove", "移出"],
    ["forfeit", "判弃权"],
    ["keep", "保留"],
  ];
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[520px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold">结束报名并开赛</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if absent.length}
          {absent.length} 名选手没有签到。移出的选手不参加本场，种子和对阵按剩下的人重新生成；判弃权的选手留在对阵里，他们的每场比赛都判对手胜。
        {:else}
          所有选手都已签到，对阵将按当前名单生成。
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if absent.length}
      <div class="flex gap-2 text-[11px]">
        <span class="text-muted-foreground self-center">全部：</span>
        {#each OPTIONS as [value, label] (value)}
          <button type="button" class="text-primary hover:underline cursor-pointer" onclick={() => setAll(value)}>{label}</button>
        {/each}
      </div>
      <div class="max-h-72 overflow-y-auto space-y-1.5 pr-1">
        {#each absent as p (p.id)}
          <div class="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5">
            <span class="flex items-center gap-1.5 text-xs font-medium min-w-0">
              <Flag code={p.flag} size={14} />
              <span class="truncate">{p.display_name}</span>
              {#if p.seed}<span class="text-[10px] text-amber-500 font-bold">#{p.seed}</span>{/if}
            </span>
            <div class="flex rounded-md bg-muted/50 p-0.5 text-[11px] shrink-0">
              {#each OPTIONS as [value, label] (value)}
                <button
                  type="button"
                  onclick={() => (choice = { ...choice, [p.id]: value })}
                  class="rounded px-2 py-0.5 font-semibold cursor-pointer {choice[p.id] === value ? (value === 'keep' ? 'bg-background text-foreground shadow-sm' : 'bg-background text-destructive shadow-sm') : 'text-muted-foreground'}"
                >
                  {label}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <div class="text-[11px] text-muted-foreground">开赛后共 {remaining} 名选手。</div>
    {/if}

    <Dialog.Footer class="flex gap-2">
      <Button variant="outline" size="sm" disabled={busy} onclick={() => (open = false)}>取消</Button>
      <Button size="sm" disabled={busy} onclick={confirmStart} class="font-bold">{busy ? "开赛中…" : "确定开赛"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
