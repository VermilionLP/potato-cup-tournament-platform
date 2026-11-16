<script>
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className = undefined,
		...restProps
	} = $props();
</script>

<TabsPrimitive.Content
	bind:ref
	data-slot="tabs-content"
	class={cn("text-sm flex-1 outline-none", className)}
	{.../** @type {any} */ (restProps)}
/>