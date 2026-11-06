<script>
  // Site footer with the ICP filing number. Chinese law requires the number
  // on every page, linked to the MIIT lookup site; it is a fixed identifier,
  // so it is not translated. Add the public-security filing here once issued.
  import { ICP_NUMBER, ICP_URL } from "#lib/site-info.js";
</script>

<footer class="border-t border-border/60 px-3 pt-4 pb-24 text-center text-xs text-muted-foreground md:pb-4">
  <a href={ICP_URL} target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">{ICP_NUMBER}</a>
</footer>
