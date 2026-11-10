<script>
  // Finished event: the vehicles flown and the Ban / Pick of every match
  // (#lib/event-banpick.js). Hidden when the event had no Ban / Pick.
  import * as Card from "#lib/components/ui/card/index.js";
  import { eventBanpickRecap } from "#lib/event-banpick.js";
  import SwordsIcon from "@lucide/svelte/icons/swords";

  let { tournament, playerName } = $props();
  let recap = $derived(eventBanpickRecap(tournament?.matches || []));
</script>

{#snippet bans(list, passes, tone)}
  {#if list.length || passes}
    <span class="flex flex-wrap gap-1">
      {#each list as g, i (i)}
        <span class="rounded px-1.5 py-0.5 text-small font-semibold {tone}">{g}</span>
      {/each}
      {#each Array(passes) as _, i (i)}
        <span class="rounded border border-dashed border-border px-1.5 py-0.5 text-small text-muted-foreground">空过</span>
      {/each}
    </span>
  {:else}
    <span class="text-muted-foreground/50">—</span>
  {/if}
{/snippet}

{#if recap.rows.length}
  <Card.Root class="border-border bg-card/40 max-w-4xl mx-auto mt-6">
    <Card.Header class="p-6 pb-3">
      <Card.Title class="text-base font-bold flex items-center gap-2">
        <SwordsIcon class="w-5 h-5 text-brand-ink" />
        载具出场与 Ban / Pick 记录
      </Card.Title>
      <Card.Description class="text-xs">每场对局双方禁用的大组和最终锁定的载具。</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4 p-6 pt-0">
      <!-- Over the event -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-border/60 bg-background/40 p-3">
          <p class="label-caps mb-2 text-muted-foreground">出场载具</p>
          {#if recap.vehicles.length}
            <div class="flex flex-wrap gap-1.5">
              {#each recap.vehicles as v (v.name)}
                <span class="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand-soft-foreground">
                  {v.name}<span class="num font-semibold opacity-70">×{v.n}</span>
                </span>
              {/each}
            </div>
          {:else}
            <p class="text-small text-muted-foreground">没有锁定的载具。</p>
          {/if}
        </div>
        <div class="rounded-xl border border-border/60 bg-background/40 p-3">
          <p class="label-caps mb-2 text-muted-foreground">被禁最多</p>
          {#if recap.banned.length}
            <div class="flex flex-wrap gap-1.5">
              {#each recap.banned.slice(0, 8) as b (b.group)}
                <span class="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:text-red-300">
                  {b.group}<span class="num font-semibold opacity-70">×{b.n}</span>
                </span>
              {/each}
            </div>
          {:else}
            <p class="text-small text-muted-foreground">本届没有人禁用大组。</p>
          {/if}
        </div>
      </div>

      <!-- Match by match -->
      <div class="overflow-x-auto rounded-xl border border-border/50 bg-background/25">
        <table class="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr class="border-b border-border/50 bg-muted/20 text-label font-bold uppercase text-muted-foreground">
              <th class="w-12 px-3 py-2.5">#</th>
              <th class="px-3 py-2.5">对阵</th>
              <th class="px-3 py-2.5">A 方禁用</th>
              <th class="px-3 py-2.5">B 方禁用</th>
              <th class="px-3 py-2.5">本场载具</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/30">
            {#each recap.rows as r (r.id)}
              <tr class="align-top hover:bg-background/40">
                <td class="px-3 py-2.5 num font-bold text-muted-foreground">{r.no ? `#${r.no}` : ""}</td>
                <td class="px-3 py-2.5">
                  <div class="flex flex-col gap-0.5">
                    <span class="flex items-center gap-1.5 {r.winner === r.p1 ? 'font-bold text-foreground' : 'text-muted-foreground'}">
                      <span class="inline-flex size-4 items-center justify-center rounded bg-side-a text-[10px] font-black text-[#2A1C02]">A</span>{playerName(r.p1)}
                    </span>
                    <span class="flex items-center gap-1.5 {r.winner === r.p2 ? 'font-bold text-foreground' : 'text-muted-foreground'}">
                      <span class="inline-flex size-4 items-center justify-center rounded bg-side-b text-[10px] font-black text-[#22124A]">B</span>{playerName(r.p2)}
                    </span>
                    {#if r.score}<span class="num text-small text-muted-foreground">{r.score}</span>{/if}
                  </div>
                </td>
                <td class="px-3 py-2.5">{@render bans(r.bansA, r.passesA, "bg-side-a/20 text-amber-800 dark:text-amber-200")}</td>
                <td class="px-3 py-2.5">{@render bans(r.bansB, r.passesB, "bg-side-b/20 text-violet-800 dark:text-violet-200")}</td>
                <td class="px-3 py-2.5">
                  {#if r.locked}
                    <span class="font-bold text-brand-ink">{r.vehicle}</span>
                    {#if r.drawnVehicle}<span class="block text-small text-muted-foreground">{r.group}</span>{/if}
                  {:else}
                    <span class="text-muted-foreground/60">未确认</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card.Content>
  </Card.Root>
{/if}
