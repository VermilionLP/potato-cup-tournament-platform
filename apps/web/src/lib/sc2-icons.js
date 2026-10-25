const LEAGUE_FILES = {
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
  diamond: "diamond",
  master: "master",
  grandmaster: "grandmaster",
};

const RACE_FILES = {
  P: "protoss",
  T: "terran",
  Z: "zerg",
  R: "random",
};

export function leagueIcon(group) {
  const file = LEAGUE_FILES[String(group || "").toLowerCase()];
  return file ? `/sc2-icons/league/${file}.svg` : null;
}

export function tierIcon(tier) {
  const match = String(tier?.key || "").match(/-([123])$/);
  return match ? `/sc2-icons/league/tier-${match[1]}.svg` : null;
}

export function raceIcon(race) {
  const file = RACE_FILES[String(race || "").toUpperCase()];
  return file ? `/sc2-icons/race/${file}.svg` : null;
}

export function raceName(race) {
  return {
    P: "Protoss",
    T: "Terran",
    Z: "Zerg",
    R: "Random",
  }[String(race || "").toUpperCase()] || "Unknown";
}
