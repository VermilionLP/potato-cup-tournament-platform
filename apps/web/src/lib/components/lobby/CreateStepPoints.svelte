<script>
  // Create-event wizard: Potato Cup points and prizes (金鹰币).
  import PointsEditor from "#lib/components/PointsEditor.svelte";
  import ToggleCard from "./ToggleCard.svelte";
  import AwardIcon from "@lucide/svelte/icons/award";

  let { form = $bindable() } = $props();
</script>

<ToggleCard
  bind:checked={form.pointsEnabled}
  icon={AwardIcon}
  title="计入土豆杯积分榜"
  description={form.pointsEnabled ? "按最终名次给积分和金鹰币奖金，赛事结束后计入积分榜。" : "不计入积分榜，也不设奖金。"}
>
  <PointsEditor bind:table={form.pointsTable} bind:season={form.pointsSeason} bind:kind={form.pointsKind} bind:invite={form.pointsInvite} />
</ToggleCard>
