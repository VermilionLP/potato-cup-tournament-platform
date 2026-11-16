<script>
	import { Calendar as CalendarPrimitive } from "bits-ui";
	import { cn } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className = undefined,
		...restProps
	} = $props();
</script>

<CalendarPrimitive.Grid
	bind:ref
	class={cn("flex w-full border-collapse flex-col", className)}
	{...restProps}
/>