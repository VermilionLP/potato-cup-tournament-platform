<script>
  // The event page before there is an event to show: loading, or not found.
  import { goto } from "$app/navigation";
  import { Button } from "#lib/components/ui/button/index.js";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  let { loading = false } = $props();
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
    <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
    <p class="text-sm">正在加载赛事详情...</p>
  </div>
{:else}
  <div class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-4">
    <TrophyIcon class="w-12 h-12 text-muted-foreground mx-auto" />
    <div>
      <h2 class="text-lg font-bold text-foreground">赛事不存在</h2>
      <p class="text-xs text-muted-foreground mt-1">您访问的赛事 ID 在数据库中未找到。</p>
    </div>
    <Button size="sm" onclick={() => goto("/")} class="gap-1 text-xs">
      <ArrowLeftIcon class="w-3.5 h-3.5" /> 返回首页
    </Button>
  </div>
{/if}
