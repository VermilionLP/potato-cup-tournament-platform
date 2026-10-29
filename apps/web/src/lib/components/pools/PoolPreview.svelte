<script>
  // Ban / Pick preview of a template as it is now (unsaved edits included):
  // the match panel to try bans and draws (nothing is saved), and the groups
  // with their size, BR range and nations. Starts over when the template,
  // its rules or its vehicles change.
  import { initialBanPick } from "$lib/banpick.js";
  import { groupSummary, previewVehicles } from "$lib/vehicle-pools.js";
  import BanPickPanel from "$lib/components/BanPickPanel.svelte";

  let { templateId = "", current, rows = [], dirty = false } = $props();

  let preview = $derived(previewVehicles(rows));
  let summary = $derived(groupSummary(preview));
  let previewKey = $derived(JSON.stringify([templateId, current?.rules, preview.map((v) => [v.name, v.group])]));
  let bp = $state(initialBanPick());
  $effect(() => {
    previewKey;
    bp = initialBanPick(current?.rules);
  });
  const brRange = (g) => (g.brMin === null ? "—" : g.brMin === g.brMax ? g.brMin.toFixed(1) : `${g.brMin.toFixed(1)}–${g.brMax.toFixed(1)}`);
</script>

<div class="space-y-3">
  <p class="text-[11px] text-muted-foreground">
    <span>{dirty ? "比赛里打开 Ban / Pick 时看到的样子，包含未保存的修改。" : "比赛里打开 Ban / Pick 时看到的样子。"}</span>
    <span>可以直接禁用、抽取试一遍，不会保存，也不影响任何比赛；改动模板后会自动重置。</span>
  </p>
  {#if preview.length}
    <div class="rounded-lg border border-border/60 bg-background/40 p-3">
      <BanPickPanel
        bind:bp
        vehicles={preview}
        poolName={current.name}
        player1={{ name: "选手 A", flag: "" }}
        player2={{ name: "选手 B", flag: "" }}
      />
    </div>
    <div class="overflow-x-auto rounded-lg border border-border/60">
      <table class="w-full min-w-[480px] text-xs">
        <thead class="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-2 py-2 text-left font-semibold">分组</th>
            <th class="w-16 px-2 py-2 text-right font-semibold">载具</th>
            <th class="w-28 px-2 py-2 text-left font-semibold">BR 范围</th>
            <th class="px-2 py-2 text-left font-semibold">国家</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/50">
          {#each summary as g (g.group)}
            <tr class="hover:bg-muted/20">
              <td class="px-2 py-1.5 font-semibold text-foreground">{g.group}</td>
              <td class="px-2 py-1.5 text-right font-mono text-muted-foreground">{g.count}</td>
              <td class="px-2 py-1.5 font-mono text-muted-foreground">{brRange(g)}</td>
              <td class="px-2 py-1.5 text-muted-foreground">{g.nations.join(" / ") || "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="py-8 text-center text-xs text-muted-foreground">载具池是空的，先在载具表里添加或导入载具</p>
  {/if}
</div>
