<script>
  // Under the header: the most urgent thing the player has to do now (their
  // match, ban turn, a score to confirm, check-in, the start), from
  // #lib/reminders.svelte.js, with one button to it. Closed per item for
  // this browser session; more items show as "+N".
  import { reminders } from "#lib/reminders.svelte.js";
  import { itemText } from "#lib/reminders.js";
  import { page } from "$app/state";
  import BellRingIcon from "@lucide/svelte/icons/bell-ring";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import XIcon from "@lucide/svelte/icons/x";

  // Minute tick for the "N minutes" countdowns.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  const list = $derived(reminders.banner ? reminders.visible : []);
  const item = $derived(list[0]);
  const text = $derived(item ? itemText(item, now) : null);
  const here = $derived(text && page.url.pathname === text.url);
  const urgent = $derived(item && (item.kind === "confirm" || item.kind === "ban" || item.kind === "ready"));
</script>

{#if item && text}
  <div
    role="status"
    aria-live="polite"
    class="sticky top-14 z-30 border-b {urgent ? 'border-primary/40 bg-primary text-primary-foreground' : 'border-primary/25 bg-primary/12 text-foreground backdrop-blur'}"
  >
    <div class="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4">
      <BellRingIcon class="size-4 shrink-0 {urgent ? 'attention-ring' : 'text-brand-ink'}" />
      <p class="min-w-0 flex-1 text-sm leading-snug">
        <span class="font-black">{text.title}</span>
        <span class="{urgent ? 'opacity-90' : 'text-muted-foreground'}"> · {text.body}</span>
        {#if list.length > 1}<span class="ml-1 rounded-full px-1.5 text-[11px] font-bold {urgent ? 'bg-primary-foreground/20' : 'bg-primary/15'}">+{list.length - 1}</span>{/if}
      </p>
      {#if !here}
        <a
          href={text.url}
          class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-bold
            {urgent ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
        >
          {text.action}<ArrowRightIcon class="size-3.5" />
        </a>
      {/if}
      <button
        type="button"
        title="关闭这条提醒"
        aria-label="关闭这条提醒"
        onclick={() => reminders.dismiss(item.key)}
        class="flex size-8 shrink-0 items-center justify-center rounded-md cursor-pointer {urgent ? 'hover:bg-primary-foreground/15' : 'text-muted-foreground hover:bg-muted'}"
      >
        <XIcon class="size-4" />
      </button>
    </div>
  </div>
{/if}

<style>
  .attention-ring {
    animation: ring 2.4s ease-in-out infinite;
    transform-origin: 50% 10%;
  }
  @keyframes ring {
    0%, 60%, 100% { transform: rotate(0); }
    65% { transform: rotate(14deg); }
    72% { transform: rotate(-12deg); }
    79% { transform: rotate(8deg); }
    86% { transform: rotate(-4deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .attention-ring { animation: none; }
  }
</style>
