<script>
  // Player list as cards (phones).
  import { isRecentlySeen, wikiUrl } from "$lib/players.js";
  import { userState } from "$lib/user.svelte.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Flag from "$lib/components/Flag.svelte";
  import ContactBadges from "./ContactBadges.svelte";
  import PlayerAvatar from "./PlayerAvatar.svelte";
  import Edit2Icon from "@lucide/svelte/icons/pencil";
  import UsersIcon from "@lucide/svelte/icons/users";

  let { players = [], isAdmin = false, emptyText = "", onedit, footer } = $props();
</script>

<div class="block sm:hidden space-y-3">
  {#each players as p (p.id)}
    <div class="bg-card border border-border rounded-xl p-4.5 space-y-3 shadow-sm hover:border-primary/30 transition-all {isRecentlySeen(p) ? '' : 'opacity-60'}">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <PlayerAvatar player={p} size="w-9 h-9" />
          <div class="min-w-0">
            <div class="font-bold text-foreground text-sm flex items-center gap-2 flex-wrap">
              <span class="truncate max-w-[120px]">{p.display_name || p.id}</span>
              {#if p.team}
                <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-secondary/15 text-secondary border-secondary/25 font-semibold">
                  {p.team}
                </Badge>
              {/if}
            </div>
          </div>
        </div>
        {#if isAdmin || p.id === userState.id}
          <Button
            variant="outline"
            size="icon"
            onclick={() => onedit(p)}
            class="w-7.5 h-7.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-border"
          >
            <Edit2Icon class="w-3.5 h-3.5" />
          </Button>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs border-t border-b border-border/40 py-2.5 my-2">
        <div>
          <span class="text-[10px] text-muted-foreground block mb-0.5">国籍 / 地区</span>
          <span class="text-foreground text-xs flex items-center gap-1">
            <Flag code={p.flag} size={18} />
            <span class="uppercase font-medium">{p.flag || "—"}</span>
          </span>
        </div>
        <div>
          <span class="text-[10px] text-muted-foreground block mb-0.5">Liquipedia</span>
          {#if p.link}
            <div class="text-xs truncate max-w-full">
              <a href={wikiUrl(p.link)} target="_blank" rel="noopener" class="text-primary hover:underline font-medium">{p.link} ↗</a>
            </div>
          {:else}
            <span class="text-muted-foreground/45">—</span>
          {/if}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-1 min-w-0">
        <div class="space-y-1 min-w-0">
          <span class="text-[10px] text-muted-foreground block">联系方式</span>
          <div class="flex flex-wrap gap-1">
            <ContactBadges tags={p.battle_tags} compact empty="未设置" />
          </div>
        </div>
        <div class="space-y-1 min-w-0">
          <span class="text-[10px] text-muted-foreground block">上次活跃 IP</span>
          <span class="text-[10px] font-mono text-muted-foreground/80 block truncate" title={p.last_ip || "—"}>{p.last_ip || "—"}</span>
        </div>
      </div>
    </div>
  {/each}

  {#if players.length === 0}
    <div class="text-center py-12 border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center justify-center gap-2">
      <UsersIcon class="w-8 h-8 text-muted-foreground/30" />
      <p class="text-xs text-muted-foreground">{emptyText}</p>
    </div>
  {/if}

  {#if footer}
    <div class="text-[11px] text-muted-foreground/80 text-center py-1.5 px-3 bg-muted/10 border border-border rounded-lg flex flex-col items-center gap-1">
      {@render footer()}
    </div>
  {/if}
</div>
