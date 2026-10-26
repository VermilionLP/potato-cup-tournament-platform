# Country flags

`<code>.svg` files are 4:3 country flags downloaded from
[flagcdn.com](https://flagcdn.com) (`https://flagcdn.com/<code>.svg`,
code list from `https://flagcdn.com/en/codes.json`).

Only two-letter ISO 3166-1 alpha-2 codes are kept; the US state /
Canadian province subdivisions served by the same endpoint are not used.

The flags are public-domain artwork (mostly sourced from Wikimedia
Commons); flagcdn.com distributes them free of charge. No build step is
needed: `apps/web/static` is copied verbatim by adapter-static, so they
are served from `/flags/<code>.svg`.

To add a country, drop another `<code>.svg` here. Unknown or missing
codes fall back to the plain code text in `$lib/components/Flag.svelte`.
