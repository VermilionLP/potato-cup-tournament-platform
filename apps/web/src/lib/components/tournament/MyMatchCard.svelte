<script>
  // "我的比赛": the signed-in player's next step in this event, at the top of
  // the event page (#lib/my-match.js): check-in before the start; during it
  // the next match (round, opponent and their contact, whose turn) with
  // the report / confirm / dispute buttons.
  import { bestOfFor } from "#lib/round-format.js";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { myMatchInfo } from "#lib/my-match.js";
  import { formatReport } from "#lib/match-card.js";
  import { formatInZone } from "#lib/datetime.js";
  import { parseContact } from "#lib/contact.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Flag from "#lib/components/Flag.svelte";
  import ContactBadges from "#lib/components/players/ContactBadges.svelte";
  import SwordsIcon from "@lucide/svelte/icons/swords";
  import CheckIcon from "@lucide/svelte/icons/check";

  let {
    tournament,
    tid,
    playerId = "",
    matchOrder = null,
    roundLabel = () => "",
    playerName = (id) => id,
    needsIdentity = () => false,
    onreport,
    onconfirm,
    ondispute,
    onwithdraw,
    onreload,
  } = $props();

  let info = $derived(myMatchInfo(tournament, playerId, { order: matchOrder }));
  let busy = $state(false);

  const TEXT = {
    checkin: "签到已开放，请在开赛前签到，没签到的选手可能被移出名单",
    "checked-in": "已签到，等待管理员开赛",
    "checkin-soon": "这场赛事需要签到",
    registered: "已报名，等待开赛",
    play: "轮到你了：联系对手开始比赛，打完后填报比分",
    reported: "你已提交比分，等待对手确认",
    confirm: "对手提交了比分，请确认",
    claimed: "对手申报你弃权；如果不对，请提出异议",
    claim: "你已申报对手弃权，等待管理员确认",
    disputed: "结果有争议，等待管理员处理",
    waiting: "等待对手：上一场比赛还没打完",
    idle: "目前没有你的比赛，等待其他对局结束",
    out: "你已被淘汰，感谢参赛",
    forfeited: "你没有签到，本场赛事的比赛都判为弃权",
  };

  async function checkin(undo = false) {
    if (needsIdentity()) return;
    busy = true;
    try {
      if (undo) await API.undoCheckIn(tid, playerId);
      else await API.checkIn(tid, playerId);
      toast.success(undo ? "已取消签到" : "签到成功");
      await onreload?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = false;
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`已复制 ${text}`),
      () => toast.error("复制失败"),
    );
  }

  let contact = $derived(parseContact(info?.opponent?.battle_tags));
</script>

{#if info}
  <section
    id="my-match-card"
    class="rounded-xl border p-4 space-y-3
      {['play', 'confirm', 'checkin'].includes(info.state) ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : info.state === 'disputed' || info.state === 'claimed' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card/40'}"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-bold flex items-center gap-1.5">
        <SwordsIcon class="w-4 h-4 text-brand-ink" />
        我的比赛
      </h2>
      <span class="text-xs font-semibold {info.state === 'play' || info.state === 'confirm' ? 'text-brand-ink' : 'text-muted-foreground'}">
        {TEXT[info.state]}
      </span>
    </div>

    {#if info.state === "checkin" || info.state === "checked-in" || info.state === "checkin-soon"}
      <div class="flex flex-wrap items-center gap-3 text-xs">
        {#if info.state === "checkin-soon"}
          <span class="text-muted-foreground">
            签到在开赛前 30 分钟开放{info.checkin?.opens_at ? `（${formatInZone(new Date(info.checkin.opens_at))}）` : ""}，开赛时没签到的选手可能被移出名单。
          </span>
        {:else if info.state === "checkin"}
          <Button size="sm" disabled={busy} onclick={() => checkin()} class="font-bold">立即签到</Button>
        {:else}
          <span class="flex items-center gap-1 text-emerald-500 font-semibold"><CheckIcon class="w-4 h-4" /> 已签到</span>
          <Button size="sm" variant="ghost" disabled={busy} onclick={() => checkin(true)} class="h-7 text-xs text-muted-foreground">取消签到</Button>
        {/if}
      </div>
    {:else if info.match}
      <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div class="space-y-1.5 min-w-0">
          <div class="text-small text-muted-foreground">
            {roundLabel(info.match)}{bestOfFor(tournament, info.match) ? ` · BO${bestOfFor(tournament, info.match)}` : ""}{matchOrder?.get?.(info.match.id) ? ` · 第 ${matchOrder.get(info.match.id)} 场` : ""}
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted-foreground">对手</span>
            {#if info.opponent}
              <a href="/player/{encodeURIComponent(info.opponent.id)}" class="flex items-center gap-1.5 font-bold hover:text-brand-ink">
                <Flag code={info.opponent.flag} size={16} />
                {info.opponent.display_name || info.opponent.id}
              </a>
            {:else}
              <span class="italic text-muted-foreground">待定</span>
            {/if}
          </div>
          {#if info.opponent}
            <div class="flex flex-wrap items-center gap-1.5">
              <ContactBadges tags={info.opponent.battle_tags} compact empty="对手没有填写联系方式" />
              {#if contact.qq}
                <button type="button" class="text-small text-brand-ink hover:underline cursor-pointer" onclick={() => copy(contact.qq)}>复制 QQ</button>
              {/if}
              {#if contact.discord}
                <button type="button" class="text-small text-brand-ink hover:underline cursor-pointer" onclick={() => copy(contact.discord)}>复制 Discord</button>
              {/if}
            </div>
          {/if}
          {#if info.report}
            <div class="text-xs">
              <span class="text-muted-foreground">{playerName(info.report.by)} 提交：</span>
              <span class="num font-semibold">{formatReport(info.match, info.match.pending_report, playerName)}</span>
              {#if info.match.pending_report?.counter}
                <span class="text-muted-foreground"> · {playerName(info.match.pending_report.counter.by)} 提交：</span>
                <span class="num font-semibold">{formatReport(info.match, info.match.pending_report.counter, playerName)}</span>
              {/if}
            </div>
          {/if}
        </div>
        <div class="flex flex-wrap gap-2 sm:justify-end">
          {#if info.state === "play"}
            <Button size="sm" onclick={() => onreport(info.match)} class="font-bold">填报比分</Button>
          {:else if info.state === "confirm"}
            <Button size="sm" onclick={() => onconfirm(info.match)} class="font-bold">确认比分</Button>
            <Button size="sm" variant="outline" onclick={() => ondispute(info.match)} class="border-destructive/40 text-destructive hover:bg-destructive hover:text-white">有异议</Button>
          {:else if info.state === "claimed"}
            <Button size="sm" variant="outline" onclick={() => ondispute(info.match)} class="border-destructive/40 text-destructive hover:bg-destructive hover:text-white">有异议</Button>
          {:else if info.state === "reported" || info.state === "claim"}
            <Button size="sm" variant="ghost" onclick={() => onwithdraw(info.match)} class="text-muted-foreground">撤回</Button>
            {#if info.state === "reported"}
              <Button size="sm" variant="outline" onclick={() => onreport(info.match)}>修改比分</Button>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </section>
{/if}
