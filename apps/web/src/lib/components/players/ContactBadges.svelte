<script>
  // A player's QQ / Discord contact as badges. The server sends contacts
  // to signed-in players and admins only; guests see a hint instead.
  import { parseContact } from "#lib/contact.js";
  import { userState } from "#lib/user.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";

  let { tags, compact = false, empty = "—" } = $props();
  let contact = $derived(parseContact(tags));
  let size = $derived(compact ? "text-small" : "text-small shrink-0");
  let guest = $derived(!userState.id && !userState.adminToken);
</script>

{#if contact.qq}
  <Badge variant="secondary" class="{size} num bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1.5 py-0">
    QQ: {contact.qq}
  </Badge>
{/if}
{#if contact.discord}
  <Badge variant="secondary" class="{size} num bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-1.5 py-0">
    Discord: {contact.discord}
  </Badge>
{/if}
{#if !contact.qq && !contact.discord}
  {#if guest}
    <span class="text-small text-muted-foreground/60" title="选手的 QQ / Discord 只对已登录的选手显示">登录后可见</span>
  {:else if compact}
    <span class="text-small text-muted-foreground/45 italic">{empty}</span>
  {:else}
    <span class="text-muted-foreground/40 text-xs">{empty}</span>
  {/if}
{/if}
