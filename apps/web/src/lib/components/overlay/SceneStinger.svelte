<script module>
  // How long the frame takes to be fully covered (the overlay page swaps the
  // scene underneath at that moment) and how long the whole stinger runs.
  export const STINGER_COVER_MS = 420;
  export const STINGER_TOTAL_MS = 1750;
</script>

<script>
  // Scene change stinger built on the Potato Cup logo
  // (static/overlay/potato-cup-logo.webp): slanted cyan panels and a grainy
  // navy one (the overlays' cyan style) slide in along the logo's slash angle and
  // cover the frame, the logo lands in the middle with a light sweep over
  // its letters and cyan slashes drifting behind it, then the panels slide
  // out the other way (the logo with them) onto the new scene. Mounted again (by a {#key}) on
  // every scene change; it ends fully out of the frame.
  const LOGO = "/overlay/potato-cup-logo.webp";
</script>

<div class="stinger" style="--total: {STINGER_TOTAL_MS}ms" aria-hidden="true">
  <div class="panel band lead"></div>
  <div class="panel dark">
    <div class="grain"></div>
    <div class="slash s1"></div>
    <div class="slash s2"></div>
    <div class="slash s3"></div>
    <div class="logo-wrap">
      <img class="logo" src={LOGO} alt="" />
      <div class="shine" style="mask-image: url({LOGO}); -webkit-mask-image: url({LOGO})"></div>
    </div>
  </div>
  <div class="panel band tail"></div>
</div>

<style>
  .stinger {
    position: absolute;
    inset: 0;
    z-index: 50;
    overflow: hidden;
    pointer-events: none;
  }

  /* Panels: slanted like the slashes in the logo (top leaning right). */
  .panel {
    position: absolute;
    top: -10%;
    height: 120%;
    left: -25%;
    width: 150%;
    transform: translateX(110%) skewX(-21deg);
    animation: wipe var(--total) cubic-bezier(0.77, 0, 0.18, 1) forwards;
  }
  .band {
    background: linear-gradient(100deg, #0891b2 0%, #22d3ee 55%, #67e8f9 100%);
  }
  /* The cyan panels sit under the navy one: the lead shows as a band
     ahead of it coming in, the tail as a band behind it going out. */
  .lead {
    z-index: 1;
    animation-delay: 0ms;
  }
  .dark {
    background: radial-gradient(ellipse at 55% 45%, #1b3a63 0%, #0a1630 72%);
    z-index: 2;
    animation-delay: 70ms;
    overflow: hidden;
  }
  .tail {
    z-index: 1;
    animation-delay: 150ms;
  }
  @keyframes wipe {
    0% {
      transform: translateX(110%) skewX(-21deg);
    }
    24%,
    74% {
      transform: translateX(0) skewX(-21deg);
    }
    100% {
      transform: translateX(-125%) skewX(-21deg);
    }
  }

  /* Film grain, like the logo's orange texture. */
  .grain {
    position: absolute;
    inset: 0;
    opacity: 0.18;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }

  /* Cyan slashes drifting behind the logo (counter-skewed inside the panel). */
  .slash {
    position: absolute;
    top: -10%;
    height: 120%;
    background: linear-gradient(180deg, #67e8f9, #0891b2);
    opacity: 0.9;
    animation: drift var(--total) linear forwards;
  }
  .s1 {
    left: 30%;
    width: 1.6%;
  }
  .s2 {
    left: 33%;
    width: 0.5%;
    opacity: 0.6;
  }
  .s3 {
    left: 68%;
    width: 0.9%;
    opacity: 0.75;
  }
  @keyframes drift {
    from {
      transform: translateX(-120px);
    }
    to {
      transform: translateX(160px);
    }
  }

  /* The logo, upright again (the panel is skewed), landing in the middle. */
  .logo-wrap {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1180px;
    transform: translate(-50%, -50%) skewX(21deg);
  }
  .logo {
    display: block;
    width: 100%;
    filter: drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55));
    opacity: 0;
    animation: land var(--total) cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  @keyframes land {
    0%,
    20% {
      opacity: 0;
      transform: scale(1.18);
      filter: blur(6px) drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55));
    }
    34% {
      opacity: 1;
      transform: scale(1);
      filter: blur(0) drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55));
    }
    100% {
      opacity: 1;
      transform: scale(0.97);
    }
  }
  /* A light sweep across the letters only (masked by the logo). */
  .shine {
    position: absolute;
    inset: 0;
    mask-size: 100% 100%;
    -webkit-mask-size: 100% 100%;
    background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.95) 50%, transparent 65%);
    background-size: 300% 100%;
    background-position: 120% 0;
    opacity: 0;
    animation: shine var(--total) ease-out forwards;
  }
  @keyframes shine {
    0%,
    34% {
      opacity: 0;
      background-position: 120% 0;
    }
    38% {
      opacity: 1;
    }
    62% {
      opacity: 1;
      background-position: -20% 0;
    }
    66%,
    100% {
      opacity: 0;
      background-position: -20% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stinger {
      display: none;
    }
  }
</style>
