<script>
  // A vehicle as War Thunder's garage slot: the wiki slot picture on the
  // dark gradient, name top right, BR bottom right (as on the 载具池 tab).
  // Ban / Pick uses it for the drawn group's vehicles and the result.
  // `state`: "" | "chosen" | "rolling" | "out". Cached picture first, then
  // the wiki, then none (#lib/wt-units.js).
  import { slotImage, slotImageDirect, unitIdOf } from "#lib/wt-units.js";

  let { vehicle, size = "md", state = "" } = $props();

  let unit = $derived(unitIdOf(vehicle, null));
  const H = { sm: "h-[46px]", md: "h-[58px]", lg: "h-[84px]" };
  const br = (v) => (v == null ? "" : Number(v).toFixed(1));

  function fallback(e) {
    const img = e.currentTarget;
    if (img.dataset.tried !== "1" && unit) {
      img.dataset.tried = "1";
      img.src = slotImageDirect(unit);
    } else img.style.visibility = "hidden";
  }
</script>

<div
  title="{vehicle.name}{vehicle.nation ? ` · ${vehicle.nation}` : ''}{vehicle.br != null ? ` · BR ${br(vehicle.br)}` : ''}{vehicle.type ? ` · ${vehicle.type}` : ''}"
  class="relative overflow-hidden rounded-[3px] border bg-gradient-to-b from-[#3a4552] to-[#262e37] text-slate-100 shadow-sm transition-all {H[size] || H.md}
    {state === 'chosen'
    ? 'border-amber-400 ring-2 ring-amber-400/70'
    : state === 'rolling'
      ? 'border-sky-300 ring-2 ring-sky-300/70 scale-[1.03]'
      : state === 'out'
        ? 'border-slate-700 opacity-35 grayscale'
        : 'border-slate-600/70'}"
>
  {#if unit}
    {#key unit}
      <img
        src={slotImage(unit)}
        alt=""
        loading="lazy"
        class="absolute bottom-0 left-0 h-full w-[78%] object-contain object-left-bottom"
        onerror={fallback}
      />
    {/key}
  {/if}
  <span
    class="absolute right-1.5 top-1 max-w-[85%] truncate text-right font-semibold leading-tight drop-shadow
      {size === 'lg' ? 'text-sm' : 'text-[11px]'} {state === 'out' ? 'line-through' : ''}"
  >
    {vehicle.name}
  </span>
  {#if vehicle.br != null}
    <span class="absolute bottom-1 right-1.5 drop-shadow {size === 'lg' ? 'text-xs' : 'text-[10px]'} text-slate-300">{br(vehicle.br)}</span>
  {/if}
</div>
