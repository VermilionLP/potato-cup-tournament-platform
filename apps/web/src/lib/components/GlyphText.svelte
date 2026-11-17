<script>
  // Text with War Thunder's name marks ("▄JAS39C") drawn as the insignia
  // the game shows (#lib/wt-glyphs.js), in the text's colour and size.
  import { splitGlyphs } from "#lib/wt-glyphs.js";

  let { text = "" } = $props();
  const parts = $derived(splitGlyphs(text));
</script>

{#each parts as p, i (i)}{#if p.glyph}<svg
      viewBox="0 0 24 24"
      class="mr-[0.12em] inline-block h-[0.9em] w-[0.9em] shrink-0 align-[-0.1em]"
      role="img"
      aria-label={p.label}
      ><title>{p.label}</title>{#if p.d}<path d={p.d} fill="currentColor" fill-rule="evenodd" />{/if}{#if p.stroke}<path
          d={p.stroke}
          fill="none"
          stroke="currentColor"
          stroke-width={p.width ?? 1.8}
          stroke-linejoin={p.join ?? "round"}
          stroke-linecap={p.cap ?? "butt"}
        />{/if}</svg
    >{:else}{p.text}{/if}{/each}
