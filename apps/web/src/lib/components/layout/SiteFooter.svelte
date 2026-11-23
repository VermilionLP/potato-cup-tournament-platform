<script>
  // Site footer with the ICP filing number and the public-security (公安)
  // filing. Chinese law requires both on every page, linked to their lookup
  // sites (MIIT; MPS, with its badge); they are fixed identifiers, so they
  // are not translated.
  // Also a link to the TSS → Liquipedia export (phones have no room for it in
  // the bottom bar).
  import { ICP_NUMBER, ICP_URL, MPS_BADGE, MPS_NUMBER, MPS_URL } from "#lib/site-info.js";
</script>

<footer class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/60 px-3 pt-4 pb-24 text-center text-xs text-muted-foreground md:pb-4">
  <a href="/tss" class="hover:text-foreground hover:underline">TSS 比赛导出到 Liquipedia</a>
  <a href={ICP_URL} target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">{ICP_NUMBER}</a>
  <a href={MPS_URL} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1 hover:text-foreground hover:underline">
    <img src={MPS_BADGE} alt="" width="14" height="16" class="h-4 w-auto" />{MPS_NUMBER}
  </a>
</footer>
