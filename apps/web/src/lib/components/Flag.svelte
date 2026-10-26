<script>
  import { flagSrc, normalizeFlagCode } from "$lib/flags.js";

  let { code = "", class: className = "", size = 20 } = $props();

  let failed = $state(false);

  const normalized = $derived(normalizeFlagCode(code));
  const label = $derived(normalized ? normalized.toUpperCase() : "");
  const src = $derived(flagSrc(code));
  const height = $derived(Math.max(10, Math.round((size * 3) / 4)));

  // A different country must clear a previous load failure.
  $effect(() => {
    src;
    failed = false;
  });
</script>

{#if src && !failed}
  <img
    {src}
    alt={label}
    title={label}
    width={size}
    {height}
    loading="lazy"
    class="inline-block shrink-0 rounded-[3px] object-cover align-middle ring-1 ring-black/10 {className}"
    onerror={() => (failed = true)}
  />
{:else}
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-[3px] bg-muted text-[9px] font-semibold leading-none text-muted-foreground ring-1 ring-border {className}"
    style="width:{size}px;height:{height}px"
    title={label || "未知国籍"}
  >
    {label || "–"}
  </span>
{/if}
