// Player contact (QQ number or Discord user name), kept in
// players.battle_tags as {"qq": "...", "discord": "..."}. Players must have
// at least one before they can register for an event or vote; admins acting
// for a player are not held to it.

import { isAdminRequest } from './admin.js';

const QQ = /^[1-9]\d{4,11}$/;
// Discord user names: 2-32 characters without spaces, "@", "#" or ":";
// an old-style "#1234" discriminator is accepted too.
const DISCORD = /^[^\s@#:]{2,32}(#\d{4})?$/;

export const CONTACT_REQUIRED = '请先在个人资料里填写 QQ 号或 Discord 用户名（右上角头像），再报名或投票';

function first(value) {
  if (Array.isArray(value)) value = value.find((v) => typeof v === 'string' && v.trim());
  return typeof value === 'string' ? value.trim() : '';
}

/** { qq, discord } from a battle_tags value (string or object). */
export function parseContact(raw) {
  let tags = raw;
  if (typeof raw === 'string') {
    try {
      tags = JSON.parse(raw || '{}');
    } catch {
      tags = {};
    }
  }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) tags = {};
  return { qq: first(tags.qq), discord: first(tags.discord) };
}

export function hasContact(raw) {
  const { qq, discord } = parseContact(raw);
  return Boolean(qq || discord);
}

/** First problem with the contact values, or '' when they are fine. */
export function contactProblem({ qq = '', discord = '' } = {}) {
  if (qq && !QQ.test(qq)) return 'QQ 号应为 5-12 位数字';
  if (discord && !DISCORD.test(discord)) return 'Discord 用户名应为 2-32 个字符，不含空格、@、# 和冒号';
  return '';
}

/** Throws 400 unless the player has a contact on file (admins skip it). */
export function requireContact(fastify, req, player) {
  if (isAdminRequest(req)) return;
  if (!hasContact(player?.battle_tags)) throw fastify.httpErrors.badRequest(CONTACT_REQUIRED);
}
