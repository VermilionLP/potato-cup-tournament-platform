<script>
  // Side card listing the registered players (names link to their pages);
  // admins can edit a profile or, while registration is open, remove a
  // player or check them in. With check-in on, each row shows its state.
  // Long names are cut with "…" (full name on hover) instead of squeezing
  // the row; team and check-in go on a second line.
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
    <Card.Title class="text-sm font-bold flex flex-wrap items-center gap-2">
      <span class="mr-auto">选手名册</span>
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
    <!-- One row per player: seed, flag and the name on the first line (the
         name gets the room and is cut with "…" when too long; the full name
         is in its tooltip), team and check-in state on a second line. -->
    <div class="space-y-1 max-h-100 overflow-y-auto pr-1">
      {#each players as p (p.id)}
        {@const second = p.team || checkinShown || p.forfeited}
        <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 transition-colors hover:bg-background/80">
          <span class="num w-7 shrink-0 text-right text-small font-bold {p.seed ? 'text-amber-500' : 'text-muted-foreground/50'}">{p.seed ? `#${p.seed}` : "—"}</span>
          <span class="shrink-0" title={p.flag ? p.flag.toUpperCase() : ""}><Flag code={p.flag} size={16} /></span>
          <div class="min-w-0 flex-1">
            <a href="/player/{encodeURIComponent(p.id)}" title={p.display_name} class="block truncate text-xs font-semibold hover:text-brand-ink hover:underline" data-no-i18n>{p.display_name}</a>
            {#if second}
              <div class="flex flex-wrap items-center gap-x-2 text-small leading-tight">
                {#if p.team}
                  <span class="num max-w-full truncate text-muted-foreground" data-no-i18n>[{p.team}]</span>
                {/if}
                {#if checkinShown}
                  {#if p.checked_in_at}
                    <span class="font-bold text-emerald-500" title="已签到">✓ 签到</span>
                  {:else if isAdmin}
                    <button type="button" onclick={() => oncheckin?.(p.id)} class="text-muted-foreground hover:text-brand-ink cursor-pointer" title="替该选手签到">未签到</button>
                  {:else}
                    <span class="text-muted-foreground">未签到</span>
                  {/if}
                {/if}
                {#if p.forfeited}
                  <span class="font-bold text-destructive" title="未签到，比赛判弃权">弃权</span>
                {/if}
              </div>
            {/if}
          </div>
          {#if isAdmin}
            <div class="flex shrink-0 items-center">
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
            </div>
          {/if}
        </div>
      {/each}
      {#if players.length === 0}
        <EmptyState compact title="暂无选手报名" />
      {/if}
    </div>
  </Card.Content>
</Card.Root>
