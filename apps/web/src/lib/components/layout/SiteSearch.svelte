<script>
  // Header search: players, events and pages (#lib/site-search.js). A
  // button in the header (a search field look on wide screens) or Ctrl+K /
  // ⌘K / "/" opens it; arrow keys and Enter pick a result. The player and
  // event lists load the first time it opens. A name that is an old ID of a
  // player (/players/lookup) also leads to them.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { API } from "#lib/api.js";
  import { flatResults, searchSite } from "#lib/site-search.js";
  import { eventStatusLabel } from "#lib/event-view.js";
  import Flag from "#lib/components/Flag.svelte";
  import SearchIcon from "@lucide/svelte/icons/search";
  import UserIcon from "@lucide/svelte/icons/user";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import CompassIcon from "@lucide/svelte/icons/compass";
  import CornerDownLeftIcon from "@lucide/svelte/icons/corner-down-left";

  let open = $state(false);
  let query = $state("");
  let players = $state([]);
  let events = $state([]);
  let loading = $state(false);
  let loaded = false;
  let active = $state(0);
  let alias = $state(null); // { alias, player } from /players/lookup
  let mac = $state(false);

  async function load() {
    if (loaded) return;
    loaded = true;
    loading = true;
    try {
      const [p, t] = await Promise.all([API.listPlayers(), API.listTournaments()]);
      players = Array.isArray(p) ? p : p?.players || [];
      events = Array.isArray(t) ? t : t?.tournaments || [];
    } catch {
      loaded = false;
    } finally {
      loading = false;
    }
  }

  export function show() {
    query = "";
    active = 0;
    open = true;
    load();
  }

  onMount(() => {
    mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let res = $derived(searchSite(query, { players, events }));
  let list = $derived.by(() => {
    const flat = flatResults(res);
    if (alias && !res.players.some((p) => p.id === alias.player.id)) {
      flat.splice(res.pages.length, 0, { kind: "alias", href: `/player/${encodeURIComponent(alias.player.id)}`, item: alias });
    }
    return flat;
  });
  $effect(() => {
    // New results: back to the first one.
    query;
    active = 0;
  });

  // An old ID: ask the server once typing pauses.
  $effect(() => {
    const name = query.trim();
    alias = null;
    if (name.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const r = await API.lookupPlayer(name);
        if (query.trim() === name && r?.alias) alias = r.alias;
      } catch {
        // nothing
      }
    }, 350);
    return () => clearTimeout(timer);
  });

  function pick(r) {
    if (!r) return;
    open = false;
    goto(r.href);
  }
  function onInputKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(list.length - 1, active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(list[active]);
    }
  }
  $effect(() => {
    if (!open) return;
    document.getElementById(`site-search-${active}`)?.scrollIntoView({ block: "nearest" });
  });

  const eventDay = (t) => String(t.played_at || t.scheduled_time || "").slice(0, 10).replace("T", " ");
</script>

<!-- Header trigger: an icon on phones, a search field look on wide screens. -->
<button
  id="header-search-button"
  type="button"
  onclick={show}
  title="搜索选手和赛事"
  aria-label="搜索选手和赛事"
  class="flex h-8 items-center gap-2 rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer w-8 justify-center lg:w-36 lg:justify-start lg:border lg:border-border/70 lg:bg-muted/30 lg:px-2.5"
>
  <SearchIcon class="h-4 w-4 shrink-0" />
  <span class="hidden flex-1 whitespace-nowrap text-left text-xs lg:inline">搜索</span>
  <kbd class="hidden rounded border border-border/80 px-1 text-label font-semibold lg:inline" data-no-i18n>{mac ? "⌘K" : "Ctrl K"}</kbd>
</button>

<Dialog.Root bind:open>
  <Dialog.Content showCloseButton={false} class="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
    <Dialog.Title class="sr-only">搜索</Dialog.Title>
    <Dialog.Description class="sr-only">搜索选手、赛事和页面</Dialog.Description>
    <div class="flex items-center gap-2 border-b border-border px-3">
      <SearchIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={query}
        onkeydown={onInputKey}
        autofocus
        placeholder="选手 ID、赛事名称或页面"
        class="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        aria-label="搜索"
        aria-controls="site-search-results"
      />
      <button type="button" onclick={() => (open = false)} class="rounded border border-border/80 px-1.5 py-0.5 text-label font-semibold text-muted-foreground hover:text-foreground cursor-pointer" data-no-i18n>Esc</button>
    </div>

    <div id="site-search-results" class="max-h-[60vh] overflow-y-auto p-1.5" role="listbox">
      {#if !query.trim()}
        <p class="px-3 py-8 text-center text-xs text-muted-foreground">输入选手 ID、赛事名称（如 Weekly #31）或页面名称（如 天梯、名人堂）</p>
      {:else if loading && !list.length}
        <p class="px-3 py-8 text-center text-xs text-muted-foreground">加载中…</p>
      {:else if !list.length}
        <p class="px-3 py-8 text-center text-xs text-muted-foreground">没有找到「{query.trim()}」</p>
      {:else}
        {#each list as r, i (r.kind + r.href)}
          {@const first = i === 0 || list[i - 1].kind !== r.kind}
          {#if first && r.kind !== "alias"}
            <p class="label-caps px-2.5 pb-1 pt-2 text-muted-foreground">{r.kind === "page" ? "页面" : r.kind === "player" ? "选手" : "赛事"}</p>
          {/if}
          <a
            id="site-search-{i}"
            href={r.href}
            role="option"
            aria-selected={i === active}
            onclick={(e) => (e.preventDefault(), pick(r))}
            onmousemove={() => (active = i)}
            class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm {i === active ? 'bg-primary/10 text-foreground' : 'text-foreground/90'}"
          >
            {#if r.kind === "page"}
              <CompassIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate font-semibold">{r.item.label}</span>
            {:else if r.kind === "player"}
              <UserIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
              <Flag code={r.item.flag} size={14} />
              <span class="min-w-0 flex-1 truncate font-semibold" data-no-i18n>{r.item.display_name || r.item.id}</span>
              {#if r.item.team}<span class="shrink-0 text-small text-muted-foreground" data-no-i18n>{r.item.team}</span>{/if}
            {:else if r.kind === "alias"}
              <UserIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate"><span class="font-semibold">{r.item.player.id}</span><span class="text-small text-muted-foreground">（曾用名 {r.item.alias}）</span></span>
            {:else}
              <TrophyIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate font-semibold" data-no-i18n>{r.item.name}</span>
              <span class="shrink-0 text-small text-muted-foreground">{r.item.status === "completed" ? eventDay(r.item) : eventStatusLabel(r.item.status)}</span>
            {/if}
            {#if i === active}<CornerDownLeftIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{/if}
          </a>
        {/each}
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
