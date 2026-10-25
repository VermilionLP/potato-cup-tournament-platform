<script>
  import { buildMmrSeries } from "$lib/ladder.js";

  let { history = [], mode = "time" } = $props();

  let width = $state(760);
  const H = 240;
  const PAD = { left: 46, right: 14, top: 14, bottom: 30 };
  let W = $derived(Math.max(300, width));
  let plotW = $derived(W - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;

  let series = $derived(buildMmrSeries(history, mode));

  let domain = $derived.by(() => {
    if (series.length === 0) return null;
    const ys = series.map((p) => p.y);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    const pad = Math.max(20, (maxY - minY) * 0.15);
    minY = Math.floor(minY - pad);
    maxY = Math.ceil(maxY + pad);
    if (maxY === minY) maxY = minY + 50;

    const xs = series.map((p) => p.x);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    if (mode === "time" && maxX === minX) {
      minX -= 86400000;
      maxX += 86400000;
    }
    if (mode === "game" && maxX === 0) maxX = 1;
    return { minX, maxX, minY, maxY };
  });

  let points = $derived.by(() => {
    if (!domain) return [];
    const sx = (x) =>
      PAD.left + ((x - domain.minX) / (domain.maxX - domain.minX || 1)) * plotW;
    const sy = (y) =>
      PAD.top + (1 - (y - domain.minY) / (domain.maxY - domain.minY || 1)) * plotH;
    return series.map((p) => ({ ...p, px: sx(p.x), py: sy(p.y) }));
  });

  let linePath = $derived(
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(" "),
  );

  let areaPath = $derived(
    points.length
      ? `${linePath} L${points[points.length - 1].px.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L${points[0].px.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`
      : "",
  );

  let yTicks = $derived.by(() => {
    if (!domain) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const value = domain.minY + ((domain.maxY - domain.minY) * i) / 4;
      return {
        value: Math.round(value),
        y: PAD.top + plotH - (plotH * i) / 4,
      };
    });
  });

  let xTicks = $derived.by(() => {
    if (!domain) return [];
    const count = W < 420 ? 3 : 5;
    return Array.from({ length: count }, (_, i) => {
      const raw = domain.minX + ((domain.maxX - domain.minX) * i) / (count - 1);
      const x = PAD.left + (plotW * i) / (count - 1);
      let label;
      if (mode === "time") {
        label = new Date(raw).toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "2-digit",
        });
      } else {
        label = String(Math.round(raw));
      }
      return { x, label };
    });
  });

  function pointTitle(p) {
    if (!p.meta) return `起点 ${p.y}`;
    const h = p.meta;
    const delta = h.mmr_delta >= 0 ? `+${h.mmr_delta}` : `${h.mmr_delta}`;
    const date = h.played_at
      ? new Date(h.played_at).toLocaleDateString("zh-CN")
      : "";
    const opponent = h.opponent_name ? ` vs ${h.opponent_name}` : "";
    const score = h.score_for != null ? ` (${h.score_for}-${h.score_against})` : "";
    const opponentMmr = h.opponent_mmr != null ? ` · 对手 ${h.opponent_mmr}` : "";
    const prefix =
      mode === "game"
        ? `${p.label}${date ? " · " + date : ""}`
        : date;
    return `${prefix}${opponent}${score}${opponentMmr} · ${h.mmr_before} → ${h.mmr_after} (${delta})`;
  }
</script>

{#if points.length === 0}
  <div class="h-48 flex items-center justify-center text-xs text-muted-foreground italic">
    暂无 MMR 曲线数据。
  </div>
{:else}
  <div bind:clientWidth={width} class="w-full">
  <svg
    viewBox="0 0 {W} {H}"
    class="w-full h-auto overflow-visible"
    role="img"
    aria-label="MMR 历史曲线"
  >
    <defs>
      <linearGradient id="mmr-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
        <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- Horizontal grid + y labels -->
    {#each yTicks as tick}
      <line
        x1={PAD.left}
        x2={PAD.left + plotW}
        y1={tick.y}
        y2={tick.y}
        class="stroke-border/60"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <text
        x={PAD.left - 8}
        y={tick.y + 3}
        text-anchor="end"
        class="fill-muted-foreground text-[9px] font-mono"
      >
        {tick.value}
      </text>
    {/each}

    <!-- Vertical grid + x labels -->
    {#each xTicks as tick}
      <line
        x1={tick.x}
        x2={tick.x}
        y1={PAD.top}
        y2={PAD.top + plotH}
        class="stroke-border/35"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <text
        x={tick.x}
        y={H - 8}
        text-anchor="middle"
        class="fill-muted-foreground text-[9px]"
      >
        {tick.label}
      </text>
    {/each}

    <!-- Area + line -->
    <path d={areaPath} fill="url(#mmr-area)" class="text-primary" />
    <path
      d={linePath}
      fill="none"
      class="stroke-primary"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />

    <!-- Points -->
    {#each points as p, i (i)}
      <circle
        cx={p.px}
        cy={p.py}
        r={i === points.length - 1 ? 4 : 2.2}
        class={i === points.length - 1 ? "fill-primary" : "fill-primary/70"}
        stroke="var(--color-background, #0b0b0b)"
        stroke-width={i === points.length - 1 ? 1.5 : 0.7}
        vector-effect="non-scaling-stroke"
      >
        <title>{pointTitle(p)}</title>
      </circle>
    {/each}
  </svg>
  </div>
{/if}
