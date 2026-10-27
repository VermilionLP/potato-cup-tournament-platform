<script>
  // Side card listing the registered players; admins can edit a profile or,
  // while registration is open, remove a player.
  import * as Card from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Flag from "$lib/components/Flag.svelte";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import TrashIcon from "@lucide/svelte/icons/trash-2";

  let { tournament, isAdmin = false, onedit, onunregister } = $props();
  let players = $derived(tournament?.players || []);
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3">
    <Card.Title class="text-sm font-bold flex items-center justify-between">
      <span>选手名册</span>
      <Badge variant="outline" class="text-[10px] bg-primary/10 text-primary border-primary/20">
        {players.length} / {tournament.player_capacity}
        人
      </Badge>
    </Card.Title>
  </Card.Header>
  <Card.Content class="p-5 pt-0">
    <div class="space-y-1.5 max-h-100 overflow-y-auto pr-1">
      {#each players as p (p.id)}
        <div class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background/40 border border-border/60 hover:bg-background/80 transition-colors">
          <span class="text-xs font-medium flex items-center gap-1.5 mr-2">
            <div class="w-2.5 h-2.5 rounded-full bg-primary/30 border border-primary/50"></div>
            {#if p.team}
              <span class="text-[10px] text-muted-foreground font-mono">[{p.team}]</span>
            {/if}
            <span>{p.display_name}</span>
            {#if p.flag}
              <span class="flex items-center gap-1">
                <Flag code={p.flag} size={16} />
                <span class="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground uppercase font-mono">{p.flag}</span>
              </span>
            {/if}
            {#if p.seed}
              <span class="text-[10px] text-amber-500 font-bold">#{p.seed}</span>
            {/if}
          </span>
          <div class="flex items-center gap-1 shrink-0">
            {#if isAdmin}
              <button
                onclick={() => onedit(p)}
                class="text-muted-foreground hover:text-primary p-1 rounded transition-colors cursor-pointer"
                title="编辑选手资料"
              >
                <SettingsIcon class="w-3.5 h-3.5" />
              </button>
              {#if tournament.status === "registration"}
                <button
                  onclick={() => onunregister(p.id)}
                  class="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                  title="注销此选手"
                >
                  <TrashIcon class="w-3.5 h-3.5" />
                </button>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
      {#if players.length === 0}
        <p class="text-xs text-muted-foreground/60 italic text-center py-6">暂无选手报名</p>
      {/if}
    </div>
  </Card.Content>
</Card.Root>
