<script>
  // Player list as a table (wide screens).
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

<div class="hidden sm:block bg-card border border-border rounded-xl overflow-hidden shadow-sm">
  <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse text-sm">
      <thead>
        <tr class="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <th class="px-5 py-3">选手</th>
          <th class="px-5 py-3">战队</th>
          <th class="px-5 py-3">国籍</th>
          <th class="px-5 py-3">联系方式</th>
          <th class="px-5 py-3">Liquipedia</th>
          <th class="px-5 py-3">IP 地址</th>
          <th class="px-5 py-3 text-right">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border/50">
        {#each players as p (p.id)}
          <tr class="hover:bg-accent/30 transition-colors group {isRecentlySeen(p) ? '' : 'opacity-60'}">
            <td class="px-5 py-3">
              <div class="flex items-center gap-3">
                <PlayerAvatar player={p} />
                <div>
                  <div class="font-semibold text-foreground leading-tight">{p.display_name || p.id}</div>
                </div>
              </div>
            </td>
            <td class="px-5 py-3">
              {#if p.team}
                <Badge variant="outline" class="text-[10px] px-1.5 py-0 bg-secondary/10 text-secondary border-secondary/25 font-semibold">
                  {p.team}
                </Badge>
              {:else}
                <span class="text-muted-foreground/40 text-xs">—</span>
              {/if}
            </td>
            <td class="px-5 py-3">
              <span class="flex items-center gap-1.5" title={p.flag?.toUpperCase()}>
                <Flag code={p.flag} size={20} />
                <span class="text-xs text-muted-foreground uppercase">{p.flag || "—"}</span>
              </span>
            </td>
            <td class="px-5 py-3">
              <div class="flex flex-wrap gap-1 max-w-[280px]">
                <ContactBadges tags={p.battle_tags} />
              </div>
            </td>
            <td class="px-5 py-3">
              {#if p.link}
                <a href={wikiUrl(p.link)} target="_blank" rel="noopener" class="text-[11px] text-primary hover:underline truncate block max-w-[160px]" title={p.link}>
                  {p.link} ↗
                </a>
              {:else}
                <span class="text-muted-foreground/40 text-xs">—</span>
              {/if}
            </td>
            <td class="px-5 py-3 font-mono text-xs text-muted-foreground/85">{p.last_ip || "—"}</td>
            <td class="px-5 py-3 text-right">
              {#if isAdmin || p.id === userState.id}
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => onedit(p)}
                  class="w-7 h-7 opacity-50 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10"
                >
                  <Edit2Icon class="w-3.5 h-3.5" />
                </Button>
              {/if}
            </td>
          </tr>
        {/each}

        {#if players.length === 0}
          <tr>
            <td colspan="7" class="px-5 py-16 text-center">
              <div class="flex flex-col items-center gap-2 text-muted-foreground">
                <UsersIcon class="w-8 h-8 opacity-30" />
                <p class="text-sm">{emptyText}</p>
              </div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if footer}
    <div class="px-5 py-2.5 border-t border-border/50 bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between gap-3">
      {@render footer()}
    </div>
  {/if}
</div>
