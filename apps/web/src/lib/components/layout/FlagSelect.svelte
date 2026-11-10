<script>
  // Nationality picker: the flag next to a select of countries / regions
  // (common ones first; #lib/flag-options.js). Used by the sign-in and the
  // profile dialog.
  import Flag from "#lib/components/Flag.svelte";
  import { flagOptions } from "#lib/flag-options.js";
  import { i18n } from "#lib/i18n/locale.svelte.js";

  let { value = $bindable(""), id = "flag-select", invalid = false } = $props();

  const en = $derived(i18n.locale === "en");
  const options = $derived(flagOptions(en ? "en" : "zh-CN"));
  // optgroup labels are attributes the page translator doesn't touch.
  const groups = $derived(en ? ["Common", "All"] : ["常用", "全部"]);
</script>

<div class="flex items-center gap-2">
  <span class="flex w-6 shrink-0 justify-center">{#if value && value !== "xx"}<Flag code={value} size={20} />{/if}</span>
  <select {id} bind:value class="field flex-1 {invalid ? 'border-destructive' : ''}" aria-invalid={invalid || undefined}>
    <option value="" disabled>请选择国籍 / 地区</option>
    <optgroup label={groups[0]}>
      {#each options.common as o (o.code)}<option value={o.code}>{o.name}</option>{/each}
      <option value="xx">不公开</option>
    </optgroup>
    <optgroup label={groups[1]}>
      {#each options.others as o (o.code)}<option value={o.code}>{o.name}</option>{/each}
    </optgroup>
  </select>
</div>
