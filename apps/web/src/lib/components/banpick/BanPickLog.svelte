<script>
  // The server's Ban / Pick log, newest first: when, who and what (undone
  // steps struck through, undos and resets shown too), so a redraw by undoing
  // stays visible. Folded to the last 3 entries.
  import { logText, logWho } from "#lib/banpick.js";
  import HistoryIcon from "@lucide/svelte/icons/history";

  let { log = [], nameOf = (id) => id } = $props();
  let open = $state(false);
  const entries = $derived([...log].reverse());
  const shown = $derived(open ? entries : entries.slice(0, 3));
  const time = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  };
</script>

<div class="rounded-lg border border-border/70 bg-muted/15 px-2.5 py-1.5 text-[11px]">
  <div class="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
    <span class="inline-flex items-center gap-1 font-semibold"><HistoryIcon class="h-3 w-3" />操作记录 · {log.length}</span>
    {#if entries.length > 3}
      <button type="button" onclick={() => (open = !open)} class="rounded px-1 hover:bg-muted hover:text-foreground cursor-pointer">
        {open ? "收起" : "全部"}
      </button>
    {/if}
  </div>
  <ol class="mt-1 space-y-0.5">
    {#each shown as e (e.n)}
      <li class="flex items-baseline gap-2 {e.undone ? 'text-muted-foreground line-through' : ''}">
        <span class="w-16 shrink-0 whitespace-nowrap font-mono text-[10px] text-muted-foreground">{time(e.at)}</span>
        {#if e.side}
          <span class="shrink-0 rounded px-1 text-[9px] font-black text-white {e.side === 'A' ? 'bg-rose-500' : 'bg-sky-500'}">{e.side}</span>
        {/if}
        <span class="min-w-0 truncate">
          <span class="font-semibold text-foreground/90">{logWho(e, nameOf)}</span>
          <span class={e.action === "undo" || e.action === "reset" ? "text-amber-600 dark:text-amber-400" : ""}>{logText(e)}</span>
        </span>
      </li>
    {/each}
  </ol>
</div>
