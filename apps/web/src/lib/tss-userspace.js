// Liquipedia user space for the TSS export (/tss): the generated page goes
// into the user's own space first (User:<name>/<page>), and is moved to the
// main space only once it is checked. The Liquipedia user name is kept in
// this browser.

const KEY = "tss-liquipedia-user";
const WIKI = "https://liquipedia.net/warthunder";

export function savedUser() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function keepUser(name) {
  try {
    localStorage.setItem(KEY, String(name || "").trim());
  } catch {
    /* private window: not kept */
  }
}

/** A page title as MediaWiki takes it: spaces as underscores, no characters it refuses. */
export function wikiTitle(text) {
  return String(text || "")
    .replace(/[#<>[\]|{}]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/** "User:<name>/<page>", or "" without a user name. */
export function draftTitle(user, page) {
  const u = wikiTitle(String(user || "").replace(/^user:/i, ""));
  if (!u) return "";
  const p = wikiTitle(page) || "Draft";
  return `User:${u}/${p}`;
}

/** The edit page of a Liquipedia page (creates it when it doesn't exist). */
export const editUrl = (title) => `${WIKI}/index.php?title=${encodeURIComponent(title).replace(/%2F/g, "/").replace(/%3A/g, ":")}&action=edit`;
