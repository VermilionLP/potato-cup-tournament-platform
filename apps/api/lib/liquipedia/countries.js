// Liquipedia writes nationality as an ISO code ("ru", "CN"), a country name
// ("Russia", "Great Britain") or an occasional three-letter code ("UKR").
// normalizeCountry turns any of these into the lowercase ISO 3166-1 alpha-2
// code used by apps/web/static/flags, or null when unknown ("xx", "").

const NAMES = {
  afghanistan: 'af', albania: 'al', algeria: 'dz', america: 'us', argentina: 'ar', armenia: 'am',
  australia: 'au', austria: 'at', azerbaijan: 'az', bahrain: 'bh', bangladesh: 'bd', belarus: 'by',
  belgium: 'be', bolivia: 'bo', 'bosnia and herzegovina': 'ba', bosnia: 'ba', brazil: 'br',
  bulgaria: 'bg', cambodia: 'kh', canada: 'ca', chile: 'cl', china: 'cn', colombia: 'co',
  'costa rica': 'cr', croatia: 'hr', cuba: 'cu', cyprus: 'cy', czechia: 'cz', 'czech republic': 'cz',
  denmark: 'dk', djibouti: 'dj', 'dominican republic': 'do', ecuador: 'ec', egypt: 'eg',
  england: 'gb', estonia: 'ee', finland: 'fi', france: 'fr', georgia: 'ge', germany: 'de',
  'great britain': 'gb', greece: 'gr', 'hong kong': 'hk', hungary: 'hu', iceland: 'is', india: 'in',
  indonesia: 'id', iran: 'ir', iraq: 'iq', ireland: 'ie', israel: 'il', italy: 'it', japan: 'jp',
  jordan: 'jo', kazakhstan: 'kz', kenya: 'ke', korea: 'kr', 'south korea': 'kr', kosovo: 'xk',
  kuwait: 'kw', kyrgyzstan: 'kg', latvia: 'lv', lebanon: 'lb', liechtenstein: 'li', lithuania: 'lt',
  luxembourg: 'lu', macau: 'mo', malaysia: 'my', malta: 'mt', mexico: 'mx', moldova: 'md',
  mongolia: 'mn', montenegro: 'me', morocco: 'ma', nepal: 'np', netherlands: 'nl',
  'new zealand': 'nz', nigeria: 'ng', 'north macedonia': 'mk', macedonia: 'mk', 'northern ireland': 'gb',
  norway: 'no', pakistan: 'pk', paraguay: 'py', peru: 'pe', philippines: 'ph', poland: 'pl',
  portugal: 'pt', qatar: 'qa', romania: 'ro', russia: 'ru', 'saudi arabia': 'sa', scotland: 'gb',
  serbia: 'rs', singapore: 'sg', slovakia: 'sk', slovenia: 'si', 'south africa': 'za', spain: 'es',
  'sri lanka': 'lk', sweden: 'se', switzerland: 'ch', syria: 'sy', taiwan: 'tw', tajikistan: 'tj',
  thailand: 'th', tunisia: 'tn', turkey: 'tr', 'türkiye': 'tr', turkmenistan: 'tm', ukraine: 'ua',
  'united arab emirates': 'ae', uae: 'ae', 'united kingdom': 'gb', uk: 'gb', 'united states': 'us',
  usa: 'us', uruguay: 'uy', uzbekistan: 'uz', venezuela: 've', vietnam: 'vn', wales: 'gb',
};

// Three-letter and non-ISO spellings seen in the wild.
const CODES = {
  ukr: 'ua', rus: 'ru', chn: 'cn', usa: 'us', gbr: 'gb', deu: 'de', ger: 'de', fra: 'fr',
  pol: 'pl', kaz: 'kz', blr: 'by', uk: 'gb', en: 'gb', el: 'gr', zh: 'cn', ja: 'jp', ko: 'kr',
};

const UNKNOWN = new Set(['xx', 'tbd', 'unknown', 'none', '-']);

export function normalizeCountry(value) {
  const v = String(value ?? '').replace(/\{\{[^}]*\}\}|\[\[|\]\]/g, '').trim().toLowerCase();
  if (!v || UNKNOWN.has(v)) return null;
  if (NAMES[v]) return NAMES[v];
  if (CODES[v]) return CODES[v];
  return /^[a-z]{2}$/.test(v) ? v : null;
}
