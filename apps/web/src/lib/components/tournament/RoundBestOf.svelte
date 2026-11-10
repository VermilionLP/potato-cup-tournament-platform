<script>
  // The best-of of one bracket round, after the round's name in its header
  // ("· BO3"). Admins pick it there: BO1 / BO3 / BO5 / BO7 or none. Reads
  // the bracket's settings from the context EventBracketCard sets
  // (#lib/round-format.js); shows nothing outside it.
  import { BEST_OF_CHOICES, roundFormat, winsNeeded } from "#lib/round-format.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import CheckIcon from "@lucide/svelte/icons/check";

  // key: the round (roundKey of one of its matches); label: its name, for the menu.
  let { key, label = "" } = $props();

  const ctx = roundFormat();
  let open = $state(false);
  let busy = $state(false);
  const value = $derived(ctx?.map?.[key] || null);

  async function choose(n) {
    busy = true;
    try {
      await ctx.save(key, n);
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

{#if ctx && key}
  {#if ctx.canEdit}
    <Popover.Root bind:open>
      <Popover.Trigger
        class="inline-flex items-center rounded-full px-1.5 cursor-pointer
          {value ? 'bg-primary/15 text-brand-ink hover:bg-primary/25' : 'text-muted-foreground/70 hover:bg-background/60 hover:text-brand-ink'}"
        title="设置本轮局数"
        aria-label={value ? `${label} BO${value}，点击修改局数` : `设置${label}的局数`}
      >{value ? `BO${value}` : "+ BO"}</Popover.Trigger>
      <Popover.Content align="center" class="w-56 gap-1 p-1.5">
        <p class="px-2 pt-1 pb-1.5 text-small font-semibold text-muted-foreground">{label} · 每场局数</p>
        <div class="grid grid-cols-2 gap-1">
          {#each BEST_OF_CHOICES as n (n)}
            <button
              type="button"
              disabled={busy}
              onclick={() => choose(n)}
              class="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-muted disabled:opacity-50 cursor-pointer
                {value === n ? 'bg-primary/12 text-brand-ink' : ''}"
            >
              <span class="flex items-center gap-1 text-sm font-bold">BO{n}{#if value === n}<CheckIcon class="size-3.5" />{/if}</span>
              <span class="text-small text-muted-foreground">{n === 1 ? "一局定胜负" : `先赢 ${winsNeeded(n)} 局`}</span>
            </button>
          {/each}
        </div>
        {#if value}
          <button type="button" disabled={busy} onclick={() => choose(null)} class="mt-0.5 rounded-md px-2.5 py-1.5 text-left text-small text-muted-foreground hover:bg-muted disabled:opacity-50 cursor-pointer">
            不显示局数
          </button>
        {/if}
      </Popover.Content>
    </Popover.Root>
  {:else if value}
    <span class="rounded-full bg-primary/15 px-1.5 text-brand-ink" title="本轮每场 BO{value}，先赢 {winsNeeded(value)} 局">BO{value}</span>
  {/if}
{/if}
