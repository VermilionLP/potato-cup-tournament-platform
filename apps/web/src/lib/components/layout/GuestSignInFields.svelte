<script>
  // Sign-in fields for a visitor: the in-game name as player ID (with a
  // note that it is the name shown in game, not the numeric account ID),
  // nationality and contact (both required), and quick picks of existing
  // players (recently active first). While the ID is
  // typed, /players/lookup says whether it is already a player (with their
  // event count), an old ID of one, or close to one, so people find their
  // existing record instead of making a second player. `lookup` is bound so
  // the dialog can ask before a new ID is saved next to a similar one.
  import { isRecentlySeen } from "#lib/players.js";
  import { looksLikeAccountId } from "#lib/flag-options.js";
  import FlagSelect from "./FlagSelect.svelte";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { parseContact } from "#lib/contact.js";
  import { API } from "#lib/api.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import InfoIcon from "@lucide/svelte/icons/info";

  let {
    idInput = $bindable(""),
    contactInput = $bindable(""),
    contactError = "",
    flag = $bindable(""),
    flagError = "",
    players = [],
    lookup = $bindable(null), // { name, exact, alias, similar } for idInput
    onsubmit,
  } = $props();

  $effect(() => {
    const name = idInput.trim();
    if (!name) {
      lookup = null;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await API.lookupPlayer(name);
        if (idInput.trim() === name) lookup = { name, ...res };
      } catch {
        lookup = null;
      }
    }, 300);
    return () => clearTimeout(timer);
  });
  let current = $derived(lookup && lookup.name === idInput.trim() ? lookup : null);
  // An existing player brings their nationality along.
  $effect(() => {
    const exact = current?.exact;
    if (!exact || flag) return;
    const known = players.find((p) => p.id === exact.id)?.flag;
    if (known) flag = known;
  });

  const eventsText = (p) => (p.events ? `参加过 ${p.events} 场赛事` : "还没有参赛记录");
  const useId = (id) => (idInput = id);

  let showInactive = $state(false);
  let active = $derived(players.filter((p) => isRecentlySeen(p.last_seen_at)));
  let inactive = $derived(players.filter((p) => !isRecentlySeen(p.last_seen_at)));

  // Picking a player fills in the contact already on file.
  function pick(player) {
    idInput = player.id;
    const contact = parseContact(player?.battle_tags);
    contactInput = contact.qq || contact.discord || "";
    if (player?.flag) flag = player.flag;
  }

  const onEnter = (e) => {
    if (e.key === "Enter") onsubmit?.();
  };
</script>

{#snippet playerChip(p, muted)}
  <button
    type="button"
    onclick={() => pick(p)}
    title={p.last_seen_at ? `最近活跃: ${new Date(p.last_seen_at).toLocaleDateString("zh-CN")}` : "无登录记录"}
    class="text-small px-2 py-0.5 rounded {muted ? 'bg-muted/70' : 'bg-muted'} hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer
      {idInput === p.id ? 'bg-primary text-primary-foreground border-primary font-bold' : muted ? 'text-muted-foreground' : 'text-foreground'}"
  >
    {p.display_name}
  </button>
{/snippet}

<div class="space-y-4 py-2">
  <div class="space-y-1.5">
    <label for="player-id-input" class="text-small font-semibold text-muted-foreground">游戏内昵称（选手 ID，必填）</label>
    <Input
      id="player-id-input"
      bind:value={idInput}
      placeholder="例如: Vermilion"
      class="bg-background"
      onkeydown={onEnter}
    />
    <p class="text-small text-muted-foreground/70">
      填你在战争雷霆里显示的名字，不是一串数字的账号 ID。对手和裁判要靠这个名字在游戏房间里找到你。
    </p>
    {#if looksLikeAccountId(idInput)}
      <p class="flex gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-small text-amber-700 dark:text-amber-300">
        <TriangleAlertIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>「{idInput.trim()}」看起来是数字账号 ID。请填游戏里显示的昵称；如果你的游戏昵称本来就是这串数字，可以忽略这条。</span>
      </p>
    {/if}
  </div>

  {#if current}
    {@const exact = current.exact}
    {#if exact}
      <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-small text-emerald-700 dark:text-emerald-300 space-y-1">
        <p class="flex items-center gap-1.5 font-semibold"><CircleCheckIcon class="w-3.5 h-3.5 shrink-0" />已有选手「{exact.id}」的记录</p>
        <p><span>{eventsText(exact)}</span>{#if exact.last_event}<span>，最近一场：{exact.last_event}</span>{/if}<span>。如果这是你，直接保存即可，以前的战绩都会算在你名下。</span></p>
        {#if exact.key_bound}
          <p class="text-amber-700 dark:text-amber-300">这个 ID 已经在其他设备上登录过：如果是你本人，保存后按提示导入那台设备的「设备密钥」，或联系管理员重置；不是你的话请换一个 ID。</p>
        {/if}
      </div>
    {:else if current.alias}
      <div class="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-small text-sky-700 dark:text-sky-300 space-y-1.5">
        <p class="flex items-center gap-1.5 font-semibold"><InfoIcon class="w-3.5 h-3.5 shrink-0" />「{current.alias.alias}」已经改名为「{current.alias.player.id}」</p>
        <p><span>{eventsText(current.alias.player)}</span><span>。如果是你，请改用新的 ID，战绩都在那里。</span></p>
        <button type="button" onclick={() => useId(current.alias.player.id)} class="rounded-md border border-sky-500/40 px-2 py-0.5 font-semibold hover:bg-sky-500/20 cursor-pointer">
          改用「{current.alias.player.id}」
        </button>
      </div>
    {/if}
    {#if !exact && current.similar.length}
      <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-small text-amber-700 dark:text-amber-300 space-y-1.5">
        <p class="flex items-center gap-1.5 font-semibold"><InfoIcon class="w-3.5 h-3.5 shrink-0" />已有相似的选手 ID，是你吗？</p>
        <p>选手 ID 区分大小写。用已有的 ID 登录，以前的比赛和天梯分数才会算在你名下；新建 ID 会变成另一位选手。</p>
        <div class="flex flex-wrap gap-1.5">
          {#each current.similar as p (p.id)}
            <button
              type="button"
              onclick={() => useId(p.id)}
              title={p.via ? `曾用名：${p.via}` : p.last_event ? `最近一场：${p.last_event}` : ""}
              class="rounded-md border border-amber-500/40 bg-background/60 px-2 py-0.5 text-foreground hover:bg-amber-500/20 cursor-pointer"
            >
              <span class="font-semibold">{p.id}</span>
              <span class="text-muted-foreground">· {p.events ? `${p.events} 场` : "无参赛"}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else if !exact && !current.alias}
      <p class="text-small text-muted-foreground">没有找到这个 ID，保存后会创建新的选手资料。</p>
    {/if}
  {/if}

  {#if players.length > 0}
    <div class="space-y-1.5">
      <span class="text-xs font-medium text-muted-foreground block">快捷选择最近一年活跃的选手 ID：</span>
      <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1">
        {#each active as p (p.id)}
          {@render playerChip(p, false)}
        {:else}
          <span class="text-small text-muted-foreground/60 italic px-1">暂无最近一年活跃的选手</span>
        {/each}
      </div>
      {#if inactive.length > 0}
        <details class="mt-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5" bind:open={showInactive}>
          <summary class="text-small text-muted-foreground cursor-pointer select-none">
            显示一年未登录的选手（{inactive.length}）
          </summary>
          <div class="flex flex-wrap gap-1.5 max-h-25 overflow-y-auto pr-1 mt-1.5">
            {#each inactive as p (p.id)}
              {@render playerChip(p, true)}
            {/each}
          </div>
        </details>
      {/if}
    </div>
  {/if}

  <div class="space-y-1.5">
    <label for="layout-flag-select" class="text-small font-semibold text-muted-foreground">国籍 / 地区（必填）</label>
    <FlagSelect id="layout-flag-select" bind:value={flag} invalid={Boolean(flagError)} />
    {#if flagError}<p class="text-small font-medium text-destructive">{flagError}</p>{/if}
  </div>

  <div class="space-y-1.5">
    <label for="layout-contact-input" class="text-small font-semibold text-muted-foreground">QQ 号 / Discord 用户名（必填）</label>
    <Input
      id="layout-contact-input"
      bind:value={contactInput}
      placeholder="例如: 123456789 或 username"
      class="bg-background"
      onkeydown={onEnter}
    />
    <p class="text-small text-muted-foreground/70">
      赛务联系用，报名和投票前必须填写。纯数字视为 QQ 号，其余视为 Discord 用户名；会写入选手资料。
    </p>
    {#if contactError}
      <p class="text-small text-destructive font-medium animate-pulse">{contactError}</p>
    {/if}
  </div>

</div>
