<script>
  // 名人堂 moved into the statistics page (its 名人堂 tab); old links land there.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  onMount(() => goto("/stats#hall", { replaceState: true }));
</script>
