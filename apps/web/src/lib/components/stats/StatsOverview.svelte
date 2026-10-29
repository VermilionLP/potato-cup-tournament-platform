<script>
  // Totals of the statistics in scope: players, events, matches.
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ActivityIcon from "@lucide/svelte/icons/activity";

  let { global } = $props();
</script>

<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
  <div class="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:border-primary/20 transition-colors">
    <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
      <UsersIcon class="w-4 h-4" />
    </div>
    <div>
      <span class="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">参赛选手</span>
      <span class="text-lg font-black text-foreground">{global.total_players} <span class="text-xs font-normal text-muted-foreground">人</span></span>
    </div>
  </div>
  <div class="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:border-primary/20 transition-colors">
    <div class="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
      <TrophyIcon class="w-4 h-4" />
    </div>
    <div>
      <span class="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">举办赛事</span>
      <span class="text-lg font-black text-foreground">{global.total_tournaments} <span class="text-xs font-normal text-muted-foreground">届</span></span>
    </div>
  </div>
  <div class="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm hover:border-primary/20 transition-colors">
    <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
      <ActivityIcon class="w-4 h-4" />
    </div>
    <div>
      <span class="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">完成对局</span>
      <span class="text-lg font-black text-foreground">{global.total_matches} <span class="text-xs font-normal text-muted-foreground">场</span></span>
    </div>
  </div>
</div>
