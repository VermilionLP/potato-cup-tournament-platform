// An event's bracket settings: the format (单败 / 双败 / 瑞士轮, or a group
// stage + playoff) and its options. Checked and normalised the same way
// when an event is created (POST /tournaments) and when an admin changes
// them before the start (PATCH /tournaments/:id).

import { SUPPORTED_FORMATS } from './tournament-config.js';
import { groupBracketProblem } from './group-brackets.js';
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE, PLAYOFF_FORMATS } from './group-stage.js';
import { isAutoRounds, MAX_SWISS_ROUNDS, MIN_SWISS_ROUNDS, parseSwissRounds } from './swiss.js';

/** The fields of the bracket settings (any of them in a PATCH means "change the bracket"). */
export const BRACKET_FIELDS = ['format', 'loser_advances', 'grand_final_reset', 'swiss_rounds', 'playoff_format', 'swiss_group_size', 'advance_per_group'];

/** The first problem with the settings, or "" (the messages the admin sees). */
export function bracketSettingsProblem({ format, swiss_rounds, playoff_format, swiss_group_size, advance_per_group } = {}) {
  if (format != null && !SUPPORTED_FORMATS.includes(String(format))) return `format must be one of: ${SUPPORTED_FORMATS.join(', ')}`;
  if (format === 'swiss' && !isAutoRounds(swiss_rounds) && !parseSwissRounds(swiss_rounds)) {
    return `瑞士轮轮数必须是 ${MIN_SWISS_ROUNDS}-${MAX_SWISS_ROUNDS} 之间的整数（留空为自动）`;
  }
  if (!playoff_format) return '';
  if (!PLAYOFF_FORMATS.includes(playoff_format)) return `playoff_format must be one of: ${PLAYOFF_FORMATS.join(', ')}`;
  const size = swiss_group_size === null || swiss_group_size === undefined || swiss_group_size === '' ? null : Number(swiss_group_size);
  if (size !== null && (!Number.isInteger(size) || size < MIN_GROUP_SIZE || size > MAX_GROUP_SIZE)) {
    return `每组人数必须在 ${MIN_GROUP_SIZE}-${MAX_GROUP_SIZE} 之间（留空表示不分组）`;
  }
  const k = Number(advance_per_group);
  if (!Number.isInteger(k) || k < 1 || k > MAX_GROUP_SIZE) return '请设置每组晋级人数（至少 1 人）';
  if (size !== null && k > size) return `每组晋级人数（${k}）不能多于每组人数（${size}）`;
  if (format !== 'swiss' && size !== null) return groupBracketProblem(format, size, k) || '';
  return '';
}

/** The stored values (as repositories/tournament-repo.js create() writes them). */
export function normalizeBracketSettings({ format, loser_advances, grand_final_reset, swiss_rounds, playoff_format, swiss_group_size, advance_per_group } = {}) {
  const bracketFormat = SUPPORTED_FORMATS.includes(format) ? format : SUPPORTED_FORMATS[0];
  // Two-stage events: `format` is the group stage, `playoff_format` the playoff.
  const playoffFormat = PLAYOFF_FORMATS.includes(playoff_format) ? playoff_format : null;
  return {
    format: bracketFormat,
    // Classic "loser advances" only applies to a single-stage bracket.
    loser_advances: !playoffFormat && bracketFormat === 'single_elim' && Number(loser_advances) ? 1 : 0,
    grand_final_reset: (playoffFormat ? playoffFormat === 'double_elim' : bracketFormat === 'double_elim') && grand_final_reset !== false,
    swiss_rounds: bracketFormat === 'swiss' ? parseSwissRounds(swiss_rounds) : null,
    playoff_format: playoffFormat,
    swiss_group_size: playoffFormat && Number(swiss_group_size) ? Number(swiss_group_size) : null,
    advance_per_group: playoffFormat ? Number(advance_per_group) || null : null,
  };
}
