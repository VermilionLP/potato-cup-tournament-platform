// What a bracket / Swiss match card shows, shared by the event page's views
// (SingleElimBracket, DoubleElimBracket, SwissView). Pure functions.

/** Score cell of a slot (1 / 2): "" while pending, W / FF for a walkover. */
export function slotScore(match, slot) {
  if (match.status === "pending") return "";
  if (match.status === "walkover") {
    const id = slot === 1 ? match.player1_id : match.player2_id;
    return match.winner_id === id ? "W" : "FF";
  }
  return slot === 1 ? match.score1 : match.score2;
}

/** Can be played now: the event is running and both players are known. */
export function isPlayableIn(match, eventStatus) {
  return eventStatus === "in_progress" && match.status === "pending" && Boolean(match.player1_id && match.player2_id);
}

/** A bye in an elimination bracket: completed with a winner but one player. */
export function isCompletedBye(match) {
  return match.status === "completed" && Boolean(match.winner_id) && (!match.player1_id || !match.player2_id);
}

/** The visitor plays in this match and it is still open. */
export function isMine(match, userId) {
  return Boolean(userId && match.status === "pending" && (match.player1_id === userId || match.player2_id === userId));
}
