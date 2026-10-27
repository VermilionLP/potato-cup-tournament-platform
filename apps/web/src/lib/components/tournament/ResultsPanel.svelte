<script>
  // Finished event: champion podium (with admin exports) and final standings.
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Flag from "$lib/components/Flag.svelte";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";

  let { tournament, podium = null, standings = [], swissTable = false, isAdmin = false, playerName, onexportjson, onexportwiki } = $props();
</script>

{#if podium}
  <div class="bg-linear-to-r from-amber-500/10 via-background to-amber-500/10 border border-primary/20 rounded-2xl p-6 text-center max-w-2xl mx-auto space-y-4 shadow-lg shadow-primary/5">
    <TrophyIcon class="w-12 h-12 text-primary mx-auto animate-bounce" />
    <div>
      <h2 class="text-xl font-extrabold tracking-tight bg-linear-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
        冠军诞生！恭喜 {playerName(podium.champion)}
      </h2>
      <p class="text-xs text-muted-foreground mt-1">Potato Cup 赛事已完美收官</p>
    </div>

    <div class="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
      <div class="p-3 bg-card/60 border border-primary/20 rounded-xl">
        <CrownIcon class="w-5 h-5 text-amber-400 mx-auto mb-1" />
        <p class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">冠军 (Gold)</p>
        <p class="text-sm font-bold text-foreground mt-0.5">{playerName(podium.champion)}</p>
      </div>
      <div class="p-3 bg-card/60 border border-border rounded-xl">
        <div class="w-5 h-5 rounded-full bg-zinc-400 text-black text-[10px] font-bold mx-auto mb-1 flex items-center justify-center">2</div>
        <p class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">亚军 (Silver)</p>
        <p class="text-sm font-bold text-foreground mt-0.5">{playerName(podium.runnerUp)}</p>
      </div>
    </div>

    <!-- Export data for wiki utilities (admins only) -->
    {#if isAdmin}
      <div class="pt-2 flex justify-center gap-3">
        <Button variant="outline" size="sm" onclick={onexportjson} class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20">
          <DownloadIcon class="w-3.5 h-3.5" />
          导出赛事数据 (JSON)
        </Button>
        <Button variant="outline" size="sm" onclick={onexportwiki} class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20">
          <FileTextIcon class="w-3.5 h-3.5" />
          生成 Liquipedia Wiki 脚本
        </Button>
      </div>
    {/if}
  </div>
{/if}

{#if standings.length > 0}
  <Card.Root class="border-border bg-card/40 max-w-2xl mx-auto mt-6">
    <Card.Header class="p-6 pb-3">
      <Card.Title class="text-base font-bold flex items-center gap-2">
        <ListOrderedIcon class="w-5 h-5 text-primary" />
        赛事最终名次排行 (Standings)
      </Card.Title>
      <Card.Description class="text-xs">
        {swissTable
          ? "按瑞士轮积分榜排名：积分 → 小分净胜 → 对手分（对手积分之和）→ 种子。"
          : "基于淘汰赛各轮次淘汰情况计算得出的选手最终名次。"}
      </Card.Description>
    </Card.Header>
    <Card.Content class="p-6 pt-0">
      <div class="overflow-x-auto border border-border/50 rounded-xl bg-background/25">
        <table class="w-full border-collapse text-left text-xs text-foreground/95">
          <thead>
            <tr class="border-b border-border/50 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground">
              <th class="py-2.5 px-4 w-40">名次</th>
              <th class="py-2.5 px-4">选手 (Player)</th>
              <th class="py-2.5 px-4 text-center w-24">胜场/总场</th>
              {#if tournament.points_awarded}
                <th class="py-2.5 px-4 text-center w-20">积分</th>
              {/if}
            </tr>
          </thead>
          <tbody class="divide-y divide-border/30">
            {#each standings as item}
              <tr class="hover:bg-background/40 transition-colors">
                <td class="py-3 px-4 font-bold text-primary">{item.rank}</td>
                <td class="py-3 px-4">
                  <span class="flex items-center gap-1.5 font-semibold">
                    {#if item.team}
                      <span class="text-[10px] text-muted-foreground font-mono">[{item.team}]</span>
                    {/if}
                    <span>{item.display_name || item.id}</span>
                    {#if item.flag}
                      <span class="flex items-center gap-1">
                        <Flag code={item.flag} size={16} />
                        <span class="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground uppercase font-mono">{item.flag}</span>
                      </span>
                    {/if}
                  </span>
                </td>
                <td class="py-3 px-4 text-center font-mono font-medium text-muted-foreground">{item.matchesWon} / {item.matchesPlayed}</td>
                {#if tournament.points_awarded}
                  <td class="py-3 px-4 text-center font-mono font-bold {tournament.points_awarded[item.id] ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/50'}">
                    {tournament.points_awarded[item.id] || "—"}
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card.Content>
  </Card.Root>
{/if}
