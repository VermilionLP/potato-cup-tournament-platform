<script>
  // Short "stinger" when the overlay changes scene: two slanted bars
  // (cyan, amber) sweep across the 1920×1080 frame with the event name
  // flashing in the middle, covering the cross-fade of the scenes beneath.
  // Mounted again (by a {#key}) on every scene change; it ends invisible.
  let { label = "" } = $props();
</script>

<div class="stinger pointer-events-none absolute inset-0 z-50 overflow-hidden" aria-hidden="true">
  <div class="bar bar-a"></div>
  <div class="bar bar-b"></div>
  {#if label}
    <div class="label font-orbitron">{label}</div>
  {/if}
</div>

<style>
  .bar {
    position: absolute;
    top: -20%;
    height: 140%;
    width: 70%;
    left: -90%;
    transform: skewX(-18deg);
  }
  .bar-a {
    background: linear-gradient(90deg, #0891b2, #22d3ee);
    animation: sweep 900ms cubic-bezier(0.7, 0, 0.3, 1) forwards;
  }
  .bar-b {
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
    width: 18%;
    animation: sweep 900ms cubic-bezier(0.7, 0, 0.3, 1) 80ms forwards;
  }
  .label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 64px;
    font-weight: 900;
    letter-spacing: 0.12em;
    color: #020617;
    text-transform: uppercase;
    opacity: 0;
    animation: flash 900ms ease forwards;
  }
  @keyframes sweep {
    0% {
      left: -90%;
    }
    45%,
    55% {
      left: 15%;
    }
    100% {
      left: 130%;
    }
  }
  @keyframes flash {
    0%,
    30% {
      opacity: 0;
    }
    45%,
    55% {
      opacity: 1;
    }
    70%,
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stinger {
      display: none;
    }
  }
</style>
