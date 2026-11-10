<script>
  // One top-N board of the 名人堂 (career boards and all-time records), so
  // every board looks alike: a title with its icon, the leader on a
  // highlighted row (crown, bigger name and value), then the rest as a
  // compact numbered list. Rows: { id, name, flag, value, unit?, note? (small,
  // before the value, e.g. 7 / 10 for a win rate),
  // tags?: [{ text, class }] }; each links to the player's page.
  import { EmptyState } from "#lib/components/ui/empty-state/index.js";
  import Flag from "#lib/components/Flag.svelte";
  import CrownIcon from "@lucide/svelte/icons/crown";

  // tone: the icon's and the leader value's colour class.
  let { title, icon: Icon, tone = "text-brand-ink", rows = [], empty = "暂无纪录" } = $props();

  const href = (r) => `/player/${encodeURIComponent(r.id)}`;
</script>

{#snippet tags(r)}
  {#if r.tags?.length}
    <span class="flex flex-wrap gap-0.5">
      {#each r.tags as t (t.text)}<span class={t.class}>{t.text}</span>{/each}
    </span>
  {/if}
{/snippet}

<section class="rounded-xl border border-border bg-card p-4 shadow-sm">
  <h3 class="mb-3 flex items-center gap-1.5 text-sm font-bold">
    <Icon class="h-4 w-4 shrink-0 {tone}" />{title}
  </h3>
  {#if rows.length}
    {@const first = rows[0]}
    <a href={href(first)} class="flex items-center gap-2.5 rounded-lg bg-muted/40 p-2.5 hover:bg-muted/70">
      <CrownIcon class="h-5 w-5 shrink-0 text-amber-500" />
      <Flag code={first.flag} size={20} />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-body font-bold">{first.name}</span>
        {@render tags(first)}
      </span>
      <span class="shrink-0 text-right">
        {#if first.note}<span class="mr-1.5 text-small text-muted-foreground num">{first.note}</span>{/if}<span class="num text-title font-bold leading-none {tone}">{first.value}</span>{#if first.unit}<span class="ml-0.5 text-small text-muted-foreground">{first.unit}</span>{/if}
      </span>
    </a>
    {#if rows.length > 1}
      <ol class="mt-1.5 space-y-0.5">
        {#each rows.slice(1) as r, i (r.id)}
          <li>
            <a href={href(r)} class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/50">
              <span class="w-4 shrink-0 text-center num text-small text-muted-foreground">{i + 2}</span>
              <Flag code={r.flag} size={16} />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{r.name}</span>
                {@render tags(r)}
              </span>
              <span class="shrink-0 text-right">
                {#if r.note}<span class="mr-1.5 text-small text-muted-foreground num">{r.note}</span>{/if}<span class="num font-bold">{r.value}</span>{#if r.unit}<span class="ml-0.5 text-small text-muted-foreground">{r.unit}</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ol>
    {/if}
  {:else}
    <EmptyState compact title={empty} />
  {/if}
</section>
