// Countries / regions players pick as their nationality (the flags shipped
// in static/flags). Names come from the browser (Intl.DisplayNames) in the
// page's language; the most common ones in this community are listed first.

export const FLAG_CODES = "ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um un us uy uz va vc ve vg vi vn vu wf ws xk xx ye yt za zm zw ".trim().split(" ");

// First in the list: the players this site mostly has.
// Not shown (a white flag), for players who'd rather not say.
export const NO_FLAG = "xx";

export const COMMON_FLAGS = ["cn", "hk", "tw", "mo", "jp", "kr", "sg", "my", "us", "gb", "de", "fr", "ru", "ua", "au", "ca"];

/** A country's name in `locale`, or its code in capitals when the browser can't name it. */
export function flagName(code, locale = "zh-CN") {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(String(code).toUpperCase()) || String(code).toUpperCase();
  } catch {
    return String(code).toUpperCase();
  }
}

/** { common, others }: [{ code, name }], the others sorted by name. */
export function flagOptions(locale = "zh-CN") {
  const known = new Set(FLAG_CODES);
  const common = COMMON_FLAGS.filter((c) => known.has(c)).map((code) => ({ code, name: flagName(code, locale) }));
  const others = FLAG_CODES.filter((c) => !COMMON_FLAGS.includes(c))
    .map((code) => ({ code, name: flagName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return { common, others };
}

/** "" when the nationality is usable, else why not (the sign-in requires one). */
export function flagProblem(code) {
  const c = String(code || "").toLowerCase();
  return c === NO_FLAG || FLAG_CODES.includes(c) ? "" : "请选择国籍 / 地区";
}

/**
 * A player ID that looks like a War Thunder account number (digits only):
 * the sign-in asks for the in-game name instead.
 */
export const looksLikeAccountId = (id) => /^\d{5,}$/.test(String(id || "").trim());
