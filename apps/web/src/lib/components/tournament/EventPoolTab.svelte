<script>
  // The 载具池 tab: for admins the template picker (PoolTemplatePicker), then
  // the pool as tech-tree cards (VehiclePoolView). Both load on first use.
  import { lazy } from "$lib/lazy.js";

  const loadPicker = lazy(() => import("./PoolTemplatePicker.svelte"));
  const loadView = lazy(() => import("./VehiclePoolView.svelte"));

  let { tournament = $bindable(), tid, isAdmin = false, template = null, templates = [], banpickEnabled = true } = $props();
</script>

{#if isAdmin}
  {#await loadPicker() then m}
    <div class="mb-4"><m.default bind:tournament {tid} {templates} bpTemplate={template} /></div>
  {/await}
{/if}
{#await loadView()}
  <p class="py-12 text-center text-xs text-muted-foreground">正在加载载具池...</p>
{:then m}
  <m.default {template} {banpickEnabled} />
{:catch e}
  <p class="py-12 text-center text-xs text-destructive">载具池加载失败：{e.message}</p>
{/await}
