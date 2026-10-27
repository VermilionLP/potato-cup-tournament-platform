<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Flag from "$lib/components/Flag.svelte";
  import { accountRegionLabel } from "$lib/utils.js";
  import { buildContact, parseContact } from "$lib/contact.js";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Edit2Icon from "@lucide/svelte/icons/pencil";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import MergeIcon from "@lucide/svelte/icons/git-merge";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import XIcon from "@lucide/svelte/icons/x";
  import PlusCircleIcon from "@lucide/svelte/icons/plus-circle";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import { isRecentlySeen } from "$lib/players.js";

  // ── Data ──────────────────────────────────────────────────────────
  let players = $state([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let isAdmin = $derived(!!userState.adminToken);

  let filteredPlayers = $derived(
    players.filter((p) => {
      const q = searchQuery.toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        (p.display_name || "").toLowerCase().includes(q) ||
        (p.team || "").toLowerCase().includes(q)
      );
    }),
  );

  // Players not seen for over a year (no event, vote or visit) are folded
  // away so active players find themselves quickly. Your own entry comes
  // first. A search always looks through everyone.
  let showInactive = $state(false);
  const mineFirst = (list) => {
    const me = list.findIndex((p) => p.id === userState.id);
    return me > 0 ? [list[me], ...list.slice(0, me), ...list.slice(me + 1)] : list;
  };
  let activePlayers = $derived(mineFirst(filteredPlayers.filter((p) => isRecentlySeen(p))));
  let inactivePlayers = $derived(filteredPlayers.filter((p) => !isRecentlySeen(p)));
  let searching = $derived(searchQuery.trim() !== "");
  let shownPlayers = $derived(
    searching || showInactive ? [...activePlayers, ...inactivePlayers] : activePlayers,
  );

  onMount(load);

  async function load() {
    loading = true;
    try {
      players = await API.listPlayers();
    } catch (e) {
      toast.error("加载选手列表失败: " + e.message);
    }
    loading = false;
  }

  // ── Edit / Create Dialog ───────────────────────────────────────────
  let showEditDialog = $state(false);
  let isCreating = $state(false);

  let editingId = $state("");
  let editNewId = $state("");
  let editFlag = $state("cn");
  let editTeam = $state("");
  let editLink = $state("");
  let editContactBase = $state({});
  let editQQ = $state("");
  let editDiscord = $state("");
  let editBnetIds = $state([]); // read-only list of [{ id, url }] account entries
  let mergeTargetId = $state("");
  // In-page confirmation ('merge' | 'delete' | 'rename-self' | null). The
  // native confirm() returns false without showing anything once a browser
  // blocks the site's dialogs, which made these buttons silently do nothing.
  let pendingAction = $state(null);
  // Admin: whether the edited player's ID is bound to a device key.
  let keyBound = $state(null);

  function parseBnetIds(raw) {
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw || [];
      return arr.map((b) => (typeof b === "string" ? { id: b, url: "" } : b));
    } catch {
      return [];
    }
  }

  function removeBnetId(index) {
    editBnetIds = editBnetIds.filter((_, i) => i !== index);
  }

  function openCreate() {
    if (!isAdmin) {
      toast.error("新增选手需要管理员权限，请先点击右上角盾牌图标登录");
      return;
    }
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    isCreating = true;
    editingId = "";
    editNewId = "";
    editFlag = "cn";
    editTeam = "";
    editLink = "";
    editContactBase = {};
    editQQ = "";
    editDiscord = "";
    editBnetIds = [];
    mergeTargetId = "";
    pendingAction = null;
    showEditDialog = true;
  }

  function openEdit(p) {
    if (!isAdmin && p.id !== userState.id) {
      toast.error("编辑其他选手需要管理员权限，请先点击右上角盾牌图标登录");
      return;
    }
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    isCreating = false;
    editingId = p.id;
    editNewId = p.id;
    editFlag = p.flag || "cn";
    editTeam = p.team || "";
    editLink = p.link || "";

    const contact = parseContact(p.battle_tags);
    editContactBase = contact.base;
    editQQ = contact.qq;
    editDiscord = contact.discord;

    editBnetIds = parseBnetIds(p.bnet_ids);
    mergeTargetId = "";
    pendingAction = null;
    showEditDialog = true;
    keyBound = null;
    if (isAdmin) {
      const id = p.id;
      API.playerKeyStatus(id)
        .then((res) => editingId === id && (keyBound = res.bound))
        .catch(() => {});
    }
  }

  async function handleResetKey() {
    if (pendingAction !== "reset-key") {
      pendingAction = "reset-key";
      return;
    }
    pendingAction = null;
    try {
      await API.resetPlayerKey(editingId);
      keyBound = false;
      toast.success("设备密钥已重置，选手下次打开网站时会绑定新设备");
    } catch (e) {
      toast.error("重置失败: " + e.message);
    }
  }

  async function handleSave() {
    const cleanNewId = editNewId.trim();
    if (!cleanNewId) {
      toast.error("选手 ID 不能为空");
      return;
    }

    try {
      if (isCreating) {
        if (
          players.some((p) => p.id.toLowerCase() === cleanNewId.toLowerCase())
        ) {
          toast.error("选手 ID 已存在");
          return;
        }
        toast.loading("正在创建选手...", { id: "ps" });
        editingId = cleanNewId;
      } else {
        if (cleanNewId !== editingId) {
          if (!isAdmin) {
            toast.error("修改选手 ID 需要管理员权限，请先点击右上角盾牌图标登录");
            return;
          }
          const isMe = editingId === userState.id;
          if (isMe && pendingAction !== "rename-self") {
            pendingAction = "rename-self";
            return;
          }
          pendingAction = null;
          toast.loading("正在修改选手 ID...", { id: "ps" });
          await API.renamePlayer(editingId, cleanNewId);
          if (isMe) {
            userState.setId(cleanNewId);
          }
          editingId = cleanNewId;
        } else {
          toast.loading("正在更新资料...", { id: "ps" });
        }
      }

      await API.updatePlayer(editingId, {
        flag: editFlag,
        team: editTeam,
        link: editLink,
        battle_tags: buildContact(editContactBase, {
          qq: editQQ,
          discord: editDiscord,
        }),
        bnet_ids: editBnetIds,
      });

      toast.dismiss("ps");
      toast.success(isCreating ? "选手创建成功" : "资料更新成功");
      showEditDialog = false;
      const isMe = editingId === userState.id;
      await load();
      if (isMe) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    } catch (e) {
      toast.dismiss("ps");
      toast.error("操作失败: " + e.message);
    }
  }

  async function handleDelete() {
    if (pendingAction !== "delete") {
      pendingAction = "delete";
      return;
    }
    pendingAction = null;
    try {
      toast.loading("正在删除...", { id: "pd" });
      await API.deletePlayer(editingId);
      toast.dismiss("pd");
      toast.success("选手已删除");
      showEditDialog = false;
      await load();
    } catch (e) {
      toast.dismiss("pd");
      toast.error("删除失败: " + e.message);
    }
  }

  async function handleMerge() {
    mergeTargetId = mergeTargetId.trim();
    if (!mergeTargetId) {
      toast.error("请选择合并目标选手");
      return;
    }
    if (mergeTargetId === editingId || !players.some((p) => p.id === mergeTargetId)) {
      toast.error(`找不到选手 ${mergeTargetId}，请从列表中选择`);
      return;
    }
    if (pendingAction !== "merge") {
      pendingAction = "merge";
      return;
    }
    pendingAction = null;
    const from = editingId;
    const into = mergeTargetId;
    try {
      toast.loading("正在合并...", { id: "pm" });
      await API.mergePlayer(from, into);
      toast.dismiss("pm");
      toast.success(`已将 ${from} 合并到 ${into}`);
      showEditDialog = false;
      players = players.filter((p) => p.id !== from);
      await load();
    } catch (e) {
      toast.dismiss("pm");
      toast.error("合并失败: " + e.message);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  const avatarColors = [
    "from-amber-500 to-orange-500",
    "from-purple-500 to-indigo-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-violet-500 to-fuchsia-500",
  ];

  function getGradient(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
    return avatarColors[s % avatarColors.length];
  }
</script>

<div class="space-y-6">
  <!-- Page header -->
  <div class="flex items-center justify-between border-b border-border/60 pb-5">
    <div>
      <h1
        class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent"
      >
        选手列表
      </h1>
      <p class="text-xs text-muted-foreground mt-1">
        共 {players.length} 名选手（近一年活跃 {players.filter((p) => isRecentlySeen(p)).length} 名）· 管理全局选手档案与关联信息
      </p>
    </div>
    {#if isAdmin}
      <Button
        onclick={openCreate}
        class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
      >
        <PlusIcon class="w-4 h-4" />
        新增选手
      </Button>
    {/if}
  </div>

  <!-- Search bar -->
  <div class="relative max-w-sm">
    <SearchIcon
      class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none"
    />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="搜索 ID、显示名、战队..."
      class="w-full pl-9 pr-4 h-8 text-sm rounded-md bg-muted/40 border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 outline-none transition-all text-foreground placeholder:text-muted-foreground/60"
    />
  </div>

  <!-- Table -->
  {#if loading}
    <div
      class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
    >
      <div
        class="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin"
      ></div>
      <p class="text-sm">正在加载选手数据...</p>
    </div>
  {:else}
    <!-- Desktop Table View -->
    <div
      class="hidden sm:block bg-card border border-border rounded-xl overflow-hidden shadow-sm"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr
              class="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
            >
              <th class="px-5 py-3">选手</th>
              <th class="px-5 py-3">战队</th>
              <th class="px-5 py-3">国籍</th>
              <th class="px-5 py-3">联系方式</th>
              <th class="px-5 py-3">Liquipedia</th>
              <th class="px-5 py-3">IP 地址</th>
              <th class="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/50">
            {#each shownPlayers as p (p.id)}
              {@const bnetIds = parseBnetIds(p.bnet_ids)}
              {@const contact = parseContact(p.battle_tags)}
              <tr class="hover:bg-accent/30 transition-colors group {isRecentlySeen(p) ? '' : 'opacity-60'}">
                <!-- Player identity -->
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <div data-no-i18n
                      class="w-8 h-8 rounded-full bg-gradient-to-br {getGradient(
                        p.id,
                      )} flex items-center justify-center text-[11px] font-bold text-white uppercase shrink-0"
                    >
                      {(p.display_name || p.id).slice(0, 2)}
                    </div>
                    <div>
                      <div class="font-semibold text-foreground leading-tight">
                        {p.display_name || p.id}
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Team -->
                <td class="px-5 py-3">
                  {#if p.team}
                    <Badge
                      variant="outline"
                      class="text-[10px] px-1.5 py-0 bg-secondary/10 text-secondary border-secondary/25 font-semibold"
                    >
                      {p.team}
                    </Badge>
                  {:else}
                    <span class="text-muted-foreground/40 text-xs">—</span>
                  {/if}
                </td>

                <!-- Flag -->
                <td class="px-5 py-3">
                  <span
                    class="flex items-center gap-1.5"
                    title={p.flag?.toUpperCase()}
                  >
                    <Flag code={p.flag} size={20} />
                    <span class="text-xs text-muted-foreground uppercase"
                      >{p.flag || "—"}</span
                    >
                  </span>
                </td>

                <!-- Contact -->
                <td class="px-5 py-3">
                  <div class="flex flex-wrap gap-1 max-w-[280px]">
                    {#if contact.qq}
                      <Badge
                        variant="secondary"
                        class="text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0 shrink-0"
                      >
                        QQ: {contact.qq}
                      </Badge>
                    {/if}
                    {#if contact.discord}
                      <Badge
                        variant="secondary"
                        class="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0 shrink-0"
                      >
                        Discord: {contact.discord}
                      </Badge>
                    {/if}
                    {#if !contact.qq && !contact.discord}
                      <span class="text-muted-foreground/40 text-xs">—</span>
                    {/if}
                  </div>
                </td>

                <!-- Wiki -->
                <td class="px-5 py-3">
                  {#if p.link}
                    <a
                      href={p.link.startsWith("http")
                        ? p.link
                        : `https://liquipedia.net/warthunder/${p.link}`}
                      target="_blank"
                      rel="noopener"
                      class="text-[11px] text-primary hover:underline truncate block max-w-[160px]"
                      title={p.link}
                    >
                      {p.link} ↗
                    </a>
                  {:else}
                    <span class="text-muted-foreground/40 text-xs">—</span>
                  {/if}
                </td>

                <!-- IP Address -->
                <td
                  class="px-5 py-3 font-mono text-xs text-muted-foreground/85"
                >
                  {p.last_ip || "—"}
                </td>

                <!-- Actions -->
                <td class="px-5 py-3 text-right">
                  {#if isAdmin || p.id === userState.id}
                    <Button
                      variant="ghost"
                      size="icon"
                      onclick={() => openEdit(p)}
                      class="w-7 h-7 opacity-50 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Edit2Icon class="w-3.5 h-3.5" />
                    </Button>
                  {/if}
                </td>
              </tr>
            {/each}

            {#if shownPlayers.length === 0}
              <tr>
                <td colspan="7" class="px-5 py-16 text-center">
                  <div
                    class="flex flex-col items-center gap-2 text-muted-foreground"
                  >
                    <UsersIcon class="w-8 h-8 opacity-30" />
                    <p class="text-sm">
                      {searchQuery ? "没有找到符合条件的选手" : inactivePlayers.length ? "最近一年没有活跃选手" : "暂无选手数据"}
                    </p>
                  </div>
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      {#if filteredPlayers.length > 0}
        <div
          class="px-5 py-2.5 border-t border-border/50 bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between gap-3"
        >
          <span>显示 {shownPlayers.length} / {players.length} 名选手</span>
          {#if inactivePlayers.length && !searching}
            {@render inactiveToggle()}
          {/if}
        </div>
      {/if}
    </div>

    <!-- Mobile Card View -->
    <div class="block sm:hidden space-y-3">
      {#each shownPlayers as p (p.id)}
        {@const bnetIds = parseBnetIds(p.bnet_ids)}
        {@const contact = parseContact(p.battle_tags)}
        <div
          class="bg-card border border-border rounded-xl p-4.5 space-y-3 shadow-sm hover:border-primary/30 transition-all {isRecentlySeen(p) ? '' : 'opacity-60'}"
        >
          <!-- Header: Avatar + Nickname/Team + Edit Button -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <div data-no-i18n
                class="w-9 h-9 rounded-full bg-gradient-to-br {getGradient(
                  p.id,
                )} flex items-center justify-center text-[11px] font-bold text-white uppercase shrink-0"
              >
                {(p.display_name || p.id).slice(0, 2)}
              </div>
              <div class="min-w-0">
                <div
                  class="font-bold text-foreground text-sm flex items-center gap-2 flex-wrap"
                >
                  <span class="truncate max-w-[120px]"
                    >{p.display_name || p.id}</span
                  >
                  {#if p.team}
                    <Badge
                      variant="outline"
                      class="text-[9px] px-1.5 py-0 bg-secondary/15 text-secondary border-secondary/25 font-semibold"
                    >
                      {p.team}
                    </Badge>
                  {/if}
                </div>
              </div>
            </div>

            {#if isAdmin || p.id === userState.id}
              <Button
                variant="outline"
                size="icon"
                onclick={() => openEdit(p)}
                class="w-7.5 h-7.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-border"
              >
                <Edit2Icon class="w-3.5 h-3.5" />
              </Button>
            {/if}
          </div>

          <!-- Body details: Flag & Wiki -->
          <div
            class="grid grid-cols-2 gap-3 text-xs border-t border-b border-border/40 py-2.5 my-2"
          >
            <div>
              <span class="text-[10px] text-muted-foreground block mb-0.5"
                >国籍 / 地区</span
              >
              <span class="text-foreground text-xs flex items-center gap-1">
                <Flag code={p.flag} size={18} />
                <span class="uppercase font-medium">{p.flag || "—"}</span>
              </span>
            </div>
            <div>
              <span class="text-[10px] text-muted-foreground block mb-0.5"
                >Liquipedia</span
              >
              {#if p.link}
                <div class="text-xs truncate max-w-full">
                  <a
                    href={p.link.startsWith("http")
                      ? p.link
                      : `https://liquipedia.net/warthunder/${p.link}`}
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:underline font-medium"
                  >
                    {p.link} ↗
                  </a>
                </div>
              {:else}
                <span class="text-muted-foreground/45">—</span>
              {/if}
            </div>
          </div>

          <!-- Footer: Contact & IP -->
          <div class="grid grid-cols-2 gap-3 pt-1 min-w-0">
            <div class="space-y-1 min-w-0">
              <span class="text-[10px] text-muted-foreground block"
                >联系方式</span
              >
              <div class="flex flex-wrap gap-1">
                {#if contact.qq}
                  <Badge
                    variant="secondary"
                    class="text-[9px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0"
                  >
                    QQ: {contact.qq}
                  </Badge>
                {/if}
                {#if contact.discord}
                  <Badge
                    variant="secondary"
                    class="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0"
                  >
                    Discord: {contact.discord}
                  </Badge>
                {/if}
                {#if !contact.qq && !contact.discord}
                  <span class="text-[10px] text-muted-foreground/45 italic"
                    >未设置</span
                  >
                {/if}
              </div>
            </div>
            <div class="space-y-1 min-w-0">
              <span class="text-[10px] text-muted-foreground block"
                >上次活跃 IP</span
              >
              <span
                class="text-[10px] font-mono text-muted-foreground/80 block truncate"
                title={p.last_ip || "—"}
                >{p.last_ip || "—"}</span
              >
            </div>
          </div>
        </div>
      {/each}

      {#if shownPlayers.length === 0}
        <div
          class="text-center py-12 border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center justify-center gap-2"
        >
          <UsersIcon class="w-8 h-8 text-muted-foreground/30" />
          <p class="text-xs text-muted-foreground">
            {searchQuery ? "没有找到符合条件的选手" : inactivePlayers.length ? "最近一年没有活跃选手" : "暂无选手数据"}
          </p>
        </div>
      {/if}

      {#if filteredPlayers.length > 0}
        <div
          class="text-[11px] text-muted-foreground/80 text-center py-1.5 px-3 bg-muted/10 border border-border rounded-lg flex flex-col items-center gap-1"
        >
          <span>显示 {shownPlayers.length} / {players.length} 名选手</span>
          {#if inactivePlayers.length && !searching}
            {@render inactiveToggle()}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet inactiveToggle()}
  <button
    type="button"
    onclick={() => (showInactive = !showInactive)}
    class="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
  >
    {#if showInactive}
      <ChevronUpIcon class="w-3.5 h-3.5" />
      收起超过一年未活跃的 {inactivePlayers.length} 名选手
    {:else}
      <ChevronDownIcon class="w-3.5 h-3.5" />
      展开超过一年未活跃的 {inactivePlayers.length} 名选手
    {/if}
  </button>
{/snippet}

<!-- ── Edit / Create Dialog ─────────────────────────────────────── -->
<Dialog.Root bind:open={showEditDialog}>
  <Dialog.Content class="max-w-[500px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title
        class="text-base font-bold text-foreground flex items-center gap-2"
      >
        <SettingsIcon class="w-4 h-4 text-primary" />
        {isCreating ? "新建选手资料" : `编辑 · ${editingId}`}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        配置选手全局档案，包含 ID、显示名称、国籍、战队、联系方式及关联 Battle.net 账号。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
      <!-- ID -->
      <div class="space-y-1">
        <label for="edit-new-id" class="text-xs font-bold text-muted-foreground"
          >选手 ID *</label
        >
        <Input
          id="edit-new-id"
          bind:value={editNewId}
          placeholder="例如: Bnet"
          class="text-xs h-8 bg-background"
        />
        <p class="text-[10px] text-muted-foreground/60">
          选手的唯一 ID 标识，若修改将同步更新其历史对阵、报名和投票数据。
        </p>
      </div>

      <!-- Contact (QQ / Discord) -->
      <div class="space-y-2.5">
        <span class="text-xs font-bold text-muted-foreground"
          >联系方式（QQ / Discord）</span
        >
        <div
          class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 border border-border/60 p-4 rounded-xl"
        >
          <div class="space-y-1">
            <label
              for="edit-contact-qq"
              class="text-[11px] font-bold text-muted-foreground">QQ 号</label
            >
            <Input
              id="edit-contact-qq"
              bind:value={editQQ}
              placeholder="例如: 123456789"
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
          <div class="space-y-1">
            <label
              for="edit-contact-discord"
              class="text-[11px] font-bold text-muted-foreground"
              >Discord 用户名</label
            >
            <Input
              id="edit-contact-discord"
              bind:value={editDiscord}
              placeholder="例如: username"
              class="text-xs h-8 bg-background border-border text-foreground"
            />
          </div>
        </div>
        <p class="text-[10px] text-muted-foreground/60">
          赛务联系用，会显示在选手列表中。
        </p>
      </div>

      <!-- Flag + Team -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="edit-flag" class="text-xs font-bold text-muted-foreground"
            >国籍 (Flag)</label
          >
          <div class="flex items-center gap-2">
            <Flag code={editFlag} size={20} />
            <Input
              id="edit-flag"
              bind:value={editFlag}
              placeholder="cn / hk / tw / xx（白旗）"
              class="text-xs h-8 flex-1"
            />
          </div>
        </div>
        <div class="space-y-1">
          <label for="edit-team" class="text-xs font-bold text-muted-foreground"
            >战队</label
          >
          <Input
            id="edit-team"
            bind:value={editTeam}
            placeholder="战队缩写"
            class="text-xs h-8"
          />
        </div>
      </div>

      <!-- Wiki Link -->
      <div class="space-y-1">
        <label for="edit-link" class="text-xs font-bold text-muted-foreground"
          >Wiki 页面名称</label
        >
        <Input
          id="edit-link"
          bind:value={editLink}
          placeholder="例如: User:Bnet"
          class="text-xs h-8"
        />
        <p class="text-[10px] text-muted-foreground/60">
          Liquipedia Wiki 页面名称，最终将链接至
          https://liquipedia.net/warthunder/&lt;名称&gt;
        </p>
      </div>

      <!-- Battle.net IDs (editable) -->
      <div class="space-y-2 pt-2 border-t border-border/60">
        <span class="text-xs font-bold text-muted-foreground block"
          >已关联的游戏账号 (可移除)</span
        >
        <div
          class="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-lg border border-border/80 bg-muted/10"
        >
          {#each editBnetIds as b, i (i)}
            <Badge
              variant="secondary"
              class="text-[10px] font-mono bg-muted/65 border border-border/60 px-2 py-0.5 gap-1"
            >
              {#if b.url}
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener"
                  class="text-primary hover:underline">{b.id} ↗</a
                >
              {:else}
                {b.id}
              {/if}
              {#if accountRegionLabel(b)}
                <span class="text-muted-foreground/70"
                  >{accountRegionLabel(b)}</span
                >
              {/if}
              <button
                type="button"
                onclick={() => removeBnetId(i)}
                title="移除该账号关联"
                class="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive cursor-pointer"
              >
                <XIcon class="w-3 h-3" />
              </button>
            </Badge>
          {/each}
          {#if editBnetIds.length === 0}
            <span
              class="text-[10px] text-muted-foreground/50 italic self-center px-1"
              >暂无关联的游戏账号。</span
            >
          {/if}
        </div>
        <p class="text-[10px] text-muted-foreground/60">
          此处为全局账号；仅在某届赛事临时使用的账号请到该赛事的「账号关联」里管理。
        </p>
      </div>

      <!-- Device key (admin, edit only) -->
      {#if !isCreating && isAdmin && keyBound !== null}
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
          <span class="text-muted-foreground">
            设备密钥：<span class="font-semibold text-foreground">{keyBound ? "已绑定" : "未绑定"}</span>
          </span>
          {#if keyBound}
            <button
              type="button"
              onclick={handleResetKey}
              class="rounded-md border px-2 py-1 text-[11px] font-semibold cursor-pointer transition-colors
                {pendingAction === 'reset-key' ? 'border-red-500 bg-red-500 text-white' : 'border-border text-muted-foreground hover:text-foreground'}"
              title="选手换了设备又找不到原密钥时使用；重置后第一个用这个 ID 的设备会重新绑定"
            >
              {pendingAction === "reset-key" ? "确认重置" : "重置密钥"}
            </button>
          {/if}
        </div>
      {/if}

      <!-- Merge section (edit only) -->
      {#if !isCreating && isAdmin}
        <div class="space-y-2 pt-2 border-t border-border/60">
          <label
            class="text-xs font-bold text-muted-foreground flex items-center gap-1.5"
          >
            <MergeIcon class="w-3.5 h-3.5" />
            合并到其他选手
          </label>
          <div class="flex gap-2">
            <input
              list="merge-target-options"
              bind:value={mergeTargetId}
              oninput={() => pendingAction === "merge" && (pendingAction = null)}
              placeholder="输入或选择目标选手 ID..."
              autocomplete="off"
              class="flex-1 min-w-0 text-xs h-8 rounded-md bg-muted/40 border border-border px-2 text-foreground focus:outline-none focus:border-primary/50"
            />
            <datalist id="merge-target-options">
              {#each players.filter((p) => p.id !== editingId) as p (p.id)}
                <option value={p.id}>{p.team ? `[${p.team}] ` : ""}{(p.flag || "").toUpperCase()}</option>
              {/each}
            </datalist>
            <Button
              variant="outline"
              size="sm"
              onclick={handleMerge}
              disabled={!mergeTargetId.trim()}
              class="text-xs gap-1 h-8 shrink-0"
            >
              <MergeIcon class="w-3.5 h-3.5" />
              执行合并
            </Button>
          </div>
          {#if pendingAction === "merge"}
            <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
              <p class="text-xs font-semibold text-amber-600 dark:text-amber-400">
                确定将 <span class="font-mono">{editingId}</span> 合并到 <span class="font-mono">{mergeTargetId}</span>？合并后 {editingId} 将被删除，无法撤销。
              </p>
              <div class="flex gap-2 justify-end">
                <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => (pendingAction = null)}>取消</Button>
                <Button size="sm" class="h-7 text-xs gap-1" onclick={handleMerge}>
                  <MergeIcon class="w-3.5 h-3.5" />
                  确认合并
                </Button>
              </div>
            </div>
          {/if}
          <p class="text-[10px] text-muted-foreground/60">
            合并后此选手的所有对阵、报名、投票和赛事账号转移到目标选手；目标选手没填的国籍、战队、联系方式和 Liquipedia 链接用此选手的补上；然后删除此选手。旧 ID 会被记住，重新导入 Liquipedia 时不会再出现。
          </p>
        </div>
      {/if}
    </div>

    {#if pendingAction === "delete" || pendingAction === "rename-self"}
      <div class="rounded-lg border p-2.5 space-y-2 {pendingAction === 'delete' ? 'border-destructive/40 bg-destructive/10' : 'border-amber-500/40 bg-amber-500/10'}">
        <p class="text-xs font-semibold {pendingAction === 'delete' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}">
          {#if pendingAction === "delete"}
            确定要删除选手 <span class="font-mono">{editingId}</span> 吗？若已出现在对阵记录中，请改用"合并"功能。
          {:else}
            修改你自己的选手 ID 会同时更新你的登录凭证，确定要改成 <span class="font-mono">{editNewId.trim()}</span> 吗？
          {/if}
        </p>
        <div class="flex gap-2 justify-end">
          <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => (pendingAction = null)}>取消</Button>
          {#if pendingAction === "delete"}
            <Button variant="destructive" size="sm" class="h-7 text-xs gap-1" onclick={handleDelete}>
              <TrashIcon class="w-3.5 h-3.5" />
              确认删除
            </Button>
          {:else}
            <Button size="sm" class="h-7 text-xs" onclick={handleSave}>确认修改</Button>
          {/if}
        </div>
      </div>
    {/if}

    <Dialog.Footer class="flex items-center gap-2 pt-1">
      {#if !isCreating && isAdmin}
        <Button
          variant="destructive"
          size="sm"
          onclick={handleDelete}
          disabled={pendingAction === "delete"}
          class="text-xs gap-1 mr-auto"
        >
          <TrashIcon class="w-3.5 h-3.5" />
          删除
        </Button>
      {/if}
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showEditDialog = false)}
        class="text-xs">取消</Button
      >
      <Button size="sm" onclick={handleSave} class="text-xs font-bold">
        {isCreating ? "创建" : "保存"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
