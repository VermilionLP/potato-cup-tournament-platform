<script>
  // One points board (a season and event type): the Liquipedia-style table
  // (placing-coloured cells, Winter Finals places highlighted), the colour
  // legend, and the Winter Finals invites (admins tick the events whose
  // champion is invited while the season is open).
  import { userState } from "#lib/user.svelte.js";
  import { vehiclePoolLabel } from "#lib/tournament.js";
  import { placeColor, placeRangeLabel } from "#lib/points.js";
  import Flag from "#lib/components/Flag.svelte";

  let { board, season, players = [], isAdmin = false, isEnded = false, savingInvite = "", shortName = (n) => n, ontoggleinvite } = $props();
  const toggleInvite = (ev) => ontoggleinvite?.(ev);
</script>

<div class="rounded-xl border border-border bg-card/40">
  <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3">
    <h2 class="text-sm font-bold text-foreground">{season} 赛季 · {vehiclePoolLabel(board.pool)}</h2>
    <span class="text-small text-muted-foreground">{board.events.length} 场积分赛 · {board.players.length} 名选手有积分</span>
  </div>
  <div class="overflow-x-auto p-2 sm:p-3">
    <!-- Point standings in the style of Liquipedia: placing-coloured cells,
         qualified places highlighted in the # column. -->
    <table class="w-full border-collapse text-xs [&_td]:border [&_td]:border-border/70 [&_th]:border [&_th]:border-border/70">
      <thead>
        <tr class="bg-muted/50 text-small font-bold text-foreground">
          <th class="sticky left-0 z-10 w-10 bg-muted px-2 py-2 text-center">#</th>
          <th class="sticky left-10 z-10 min-w-44 bg-muted px-3 py-2 text-center">选手</th>
          <th class="w-16 px-2 py-2 text-center leading-tight">总积分</th>
          <th class="px-2 py-2 text-center whitespace-nowrap">冬季总决赛</th>
          {#each board.events as ev (ev.id)}
            <th class="w-16 min-w-16 px-1.5 py-2 text-center align-bottom leading-tight">
              <a href="/tournament/{encodeURIComponent(ev.id)}" class="font-bold text-sky-600 hover:underline dark:text-sky-400" title={ev.name}>{shortName(ev.name)}</a>
              {#if ev.invite}<div class="text-small font-bold text-amber-500" title="冠军直邀冬季总决赛">邀</div>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each players as p, i (p.id)}
          <tr class="{i % 2 ? 'bg-muted/25' : 'bg-card'} {p.id === userState.id ? 'outline outline-2 -outline-offset-2 outline-primary/60' : ''}">
            <td
              class="sticky left-0 z-10 px-2 py-1.5 text-center num font-bold
                {p.finals ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100' : i % 2 ? 'bg-muted' : 'bg-card'}"
              title={p.finals ? "冬季总决赛名额" : undefined}
            >{p.rank}</td>
            <td class="sticky left-10 z-10 px-2 py-1.5 {i % 2 ? 'bg-muted' : 'bg-card'}">
              <div class="flex items-center gap-1.5 min-w-0">
                <Flag code={p.flag} size={16} />
                {#if p.team}
                  <span class="shrink-0 num text-small font-bold text-muted-foreground">[{p.team}]</span>
                {/if}
                <span class="truncate font-semibold text-foreground">{p.display_name}</span>
              </div>
            </td>
            <td class="px-2 py-1.5 text-center font-bold text-foreground">{p.total}</td>
            <td class="px-2 py-1.5 whitespace-nowrap">
              {#if p.finals?.via === "invite"}
                <span class="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-small font-bold text-amber-600 dark:text-amber-400" title="直邀名额">
                  直邀 · {shortName(board.events.find((e) => e.id === p.finals.event_id)?.name)}
                </span>
              {:else if p.finals?.via === "points"}
                <span class="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-small font-bold text-emerald-600 dark:text-emerald-400">积分</span>
              {/if}
            </td>
            {#each board.events as ev (ev.id)}
              {@const place = p.places?.[ev.id]}
              {#if p.points[ev.id]}
                <td
                  class="px-1 py-1.5 text-center font-bold text-white"
                  style="background-color: {placeColor(place)}"
                  title={place ? placeRangeLabel(place) : undefined}
                >{p.points[ev.id]}</td>
              {:else}
                <td class="px-1 py-1.5"></td>
              {/if}
            {/each}
          </tr>
        {:else}
          <tr>
            <td colspan={4 + board.events.length} class="py-10 text-center text-muted-foreground">没有匹配的选手</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-small text-muted-foreground">
    {#each [[{ from: 1, to: 1 }, "第 1 名"], [{ from: 2, to: 2 }, "第 2 名"], [{ from: 3, to: 3 }, "第 3 名 / 3-4 名"], [{ from: 4, to: 4 }, "第 4 名"], [{ from: 5, to: 8 }, "第 5-8 名"], [{ from: 9, to: 16 }, "第 9 名以后"]] as [place, label] (label)}
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-3 w-3 rounded-sm" style="background-color: {placeColor(place)}"></span>{label}
      </span>
    {/each}
    <span class="inline-flex items-center gap-1">
      <span class="inline-block h-3 w-3 rounded-sm bg-emerald-100 ring-1 ring-emerald-300 dark:bg-emerald-900/60"></span>冬季总决赛名额
    </span>
  </div>
  <div class="space-y-2 border-t border-border/50 px-4 py-3">
    <div class="text-small font-bold text-foreground">
      直邀名额 {board.finals.invites.length} 个 · 积分名额 {board.finals.points_spots} 个
    </div>
    {#if isAdmin && !isEnded}
      <p class="text-small text-muted-foreground">勾选的赛事，冠军直接获得冬季总决赛名额；随时可以更改。</p>
      <div class="flex flex-wrap gap-1.5">
        {#each board.events as ev (ev.id)}
          <label class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-small cursor-pointer
            {ev.invite ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}">
            <input type="checkbox" class="accent-amber-500" checked={ev.invite} disabled={!!savingInvite} onchange={() => toggleInvite(ev)} />
            {shortName(ev.name)}
          </label>
        {/each}
      </div>
      {#if board.finals.invites.some((i) => !i.finished)}
        <p class="text-small text-muted-foreground">
          还没结束的直邀赛事（名额已预留）：{board.finals.invites.filter((i) => !i.finished).map((i) => shortName(i.name)).join("、")}；可在赛事页的积分设置里更改。
        </p>
      {/if}
    {:else if board.finals.invites.length}
      <p class="text-small text-muted-foreground">
        直邀赛事：{board.finals.invites.map((i) => shortName(i.name) + (i.finished ? "" : "（未结束）")).join("、")}
      </p>
    {/if}
    <p class="text-small text-muted-foreground">
      「直邀」为指定赛事冠军的名额（冠军已有资格时顺延给亚军），「积分」为按积分排名的名额，随赛季进行变化。同分并列同一名次。
    </p>
  </div>
</div>
