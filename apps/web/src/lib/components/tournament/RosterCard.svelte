<script>
  // Side card listing the registered players (names link to their pages);
  // admins can edit a profile or, while registration is open, remove a
  // player or check them in. With check-in on, each row shows its state.
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import Flag from "#lib/components/Flag.svelte";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import TrashIcon from "@lucide/svelte/icons/trash-2";

  let { tournament, isAdmin = false, onedit, onunregister, oncheckin } = $props();
  let players = $derived(tournament?.players || []);
  let checkinShown = $derived(Boolean(tournament?.checkin?.enabled) && tournament?.status === "registration");
  let checkedCount = $derived(players.filter((p) => p.checked_in_at).length);
</script>

<Card.Root class="border-border bg-card/40">
  <Card.Header class="p-5 pb-3">
    <Card.Title class="text-sm font-bold flex items-center justify-between">
      <span>选手名册</span>
      <Badge variant="outline" class="text-small bg-primary/10 text-brand-ink border-primary/20">
        {players.length} / {tournament.player_capacity}
        人
      </Badge>
      {#if checkinShown}
        <Badge variant="outline" class="text-small bg-emerald-500/10 text-emerald-500 border-emerald-500/20">已签到 {checkedCount} / {players.length}</Badge>
      {/if}
    </Card.Title>
  </Card.Header>
  <Card.Content class="p-5 pt-0">
    <div class="space-y-1.5 max-h-100 overflow-y-auto pr-1">
      {#each players as p (p.id)}
        <div class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background/40 border border-border/60 hover:bg-background/80 transition-colors">
          <span class="text-xs font-medium flex items-center gap-1.5 mr-2">
            <div class="w-2.5 h-2.5 rounded-full bg-primary/30 border border-primary/50"></div>
            {#if p.team}
              <span class="text-small text-muted-foreground num">[{p.team}]</span>
            {/if}
            <a href="/player/{encodeURIComponent(p.id)}" class="hover:text-brand-ink hover:underline">{p.display_name}</a>
            {#if p.flag}
              <span class="flex items-center gap-1">
                <Flag code={p.flag} size={16} />
                <span class="text-label font-bold px-1 rounded bg-muted text-muted-foreground uppercase num">{p.flag}</span>
              </span>
            {/if}
            {#if p.seed}
              <span class="text-small text-amber-500 font-bold">#{p.seed}</span>
            {/if}
            {#if checkinShown}
              {#if p.checked_in_at}
                <span class="text-small font-bold text-emerald-500" title="已签到">✓ 签到</span>
              {:else if isAdmin}
                <button type="button" onclick={() => oncheckin?.(p.id)} class="text-small text-muted-foreground hover:text-brand-ink cursor-pointer" title="替该选手签到">未签到</button>
              {:else}
                <span class="text-small text-muted-foreground">未签到</span>
              {/if}
            {/if}
            {#if p.forfeited}
              <span class="text-small font-bold text-destructive" title="未签到，比赛判弃权">弃权</span>
            {/if}
          </span>
          <div class="flex items-center gap-1 shrink-0">
            {#if isAdmin}
              <button
                onclick={() => onedit(p)}
                class="text-muted-foreground hover:text-brand-ink p-1 rounded transition-colors cursor-pointer"
                title="编辑选手资料"
              >
                <SettingsIcon class="w-3.5 h-3.5" />
              </button>
              {#if tournament.status === "registration"}
                <button
                  onclick={() => onunregister(p.id)}
                  class="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
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
        <EmptyState compact title="暂无选手报名" />
      {/if}
    </div>
  </Card.Content>
</Card.Root>
