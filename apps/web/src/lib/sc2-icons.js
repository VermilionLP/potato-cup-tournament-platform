const LEAGUE_FILES = {
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
  diamond: "diamond",
  master: "master",
  grandmaster: "grandmaster",
};

export function leagueIcon(group) {
  const file = LEAGUE_FILES[String(group || "").toLowerCase()];
  return file ? `/sc2-icons/league/${file}.svg` : null;
}

export function tierIcon(tier) {
  const match = String(tier?.key || "").match(/-([123])$/);
  return match ? `/sc2-icons/league/tier-${match[1]}.svg` : null;
}
