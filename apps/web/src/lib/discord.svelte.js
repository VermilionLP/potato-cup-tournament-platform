// The Potato Cup Discord server: its invite, and the "join the server"
// prompt shown once a player has registered (JoinDiscordDialog, mounted in
// the root layout). A player who says they are already in is not asked
// again on this browser.

export const DISCORD_INVITE = "https://discord.gg/3KchNdgePr";

const KEY = "suck_discord_joined";
const readJoined = () => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const discord = $state({
  joined: readJoined(),
  prompt: { open: false, event: "", checkin: false },
});

/** Remembers that this player is in the server (they joined or said so). */
export function markDiscordJoined() {
  discord.joined = true;
  discord.prompt.open = false;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // private mode: asked again next time
  }
}

/**
 * After the player registered for `event` ({ name, checkin }): asks them to
 * join the server, unless they already have. Returns whether it asked.
 */
export function promptDiscordAfterRegistering(event = {}) {
  if (discord.joined) return false;
  discord.prompt = { open: true, event: String(event.name || ""), checkin: Boolean(event.checkin) };
  return true;
}
