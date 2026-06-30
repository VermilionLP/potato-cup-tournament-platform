<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Edit2Icon from "@lucide/svelte/icons/pencil";
  import UsersIcon from "@lucide/svelte/icons/users";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import MergeIcon from "@lucide/svelte/icons/git-merge";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import XIcon from "@lucide/svelte/icons/x";
  import PlusCircleIcon from "@lucide/svelte/icons/plus-circle";

  // ── Data ──────────────────────────────────────────────────────────
  let players = $state([]);
  let loading = $state(true);
  let searchQuery = $state("");

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
  let editBattleTags = $state({ cn: [], global: [] });
  let editBnetIds = $state([]); // read-only list of [{ id, url }] from replay
  let mergeTargetId = $state("");

  function parseBnetIds(raw) {
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw || [];
      return arr.map((b) => (typeof b === "string" ? { id: b, url: "" } : b));
    } catch {
      return [];
    }
  }

  function openCreate() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    isCreating = true;
    editingId = "";
    editNewId = "";
    editFlag = "cn";
    editTeam = "";
    editLink = "";
    editBattleTags = { cn: [], global: [] };
    editBnetIds = [];
    mergeTargetId = "";
    showEditDialog = true;
  }

  function openEdit(p) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    isCreating = false;
    editingId = p.id;
    editNewId = p.id;
    editFlag = p.flag || "cn";
    editTeam = p.team || "";
    editLink = p.link || "";

    let parsedTags = {};
    if (p.battle_tags) {
      try {
        parsedTags =
          typeof p.battle_tags === "string"
            ? JSON.parse(p.battle_tags)
            : p.battle_tags;
      } catch (_) {}
    }
    const parseToArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      if (typeof val === "string")
        return val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      return [];
    };
    editBattleTags = {
      cn: parseToArray(parsedTags.cn),
      global: parseToArray(parsedTags.global),
    };

    editBnetIds = parseBnetIds(p.bnet_ids);
    mergeTargetId = "";
    showEditDialog = true;
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
          const isMe = editingId === userState.id;
          if (isMe) {
            const confirmed = confirm(
              `修改您的选手 ID 将会同时更新您的登录凭证，确定要修改吗？`,
            );
            if (!confirmed) return;
          }
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
        battle_tags: editBattleTags,
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
    if (
      !confirm(
        `确定要删除选手 ${editingId} 吗？\n若已出现在对阵记录中，请改用"合并"功能。`,
      )
    )
      return;
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
    if (!mergeTargetId) {
      toast.error("请选择合并目标选手");
      return;
    }
    if (
      !confirm(
        `确定将 ${editingId} 合并到 ${mergeTargetId}？\n合并后 ${editingId} 将被删除！`,
      )
    )
      return;
    try {
      toast.loading("正在合并...", { id: "pm" });
      await API.mergePlayer(editingId, mergeTargetId);
      toast.dismiss("pm");
      toast.success("合并成功");
      showEditDialog = false;
      await load();
    } catch (e) {
      toast.dismiss("pm");
      toast.error("合并失败: " + e.message);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  const flagEmoji = (f) => {
    const map = {
      cn: "🇨🇳",
      hk: "🇭🇰",
      tw: "🇹🇼",
      us: "🇺🇸",
      kr: "🇰🇷",
      de: "🇩🇪",
      fr: "🇫🇷",
    };
    return map[(f || "").toLowerCase()] ?? "🏳️";
  };

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
        共 {players.length} 名选手 · 管理全局选手档案与关联信息
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
    >
      <PlusIcon class="w-4 h-4" />
      新增选手
    </Button>
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
              <th class="px-5 py-3">BattleTags</th>
              <th class="px-5 py-3">Liquipedia</th>
              <th class="px-5 py-3">IP 地址</th>
              <th class="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/50">
            {#each filteredPlayers as p (p.id)}
              {@const bnetIds = parseBnetIds(p.bnet_ids)}
              {@const tags = (() => {
                try {
                  const parsed =
                    typeof p.battle_tags === "string"
                      ? JSON.parse(p.battle_tags)
                      : p.battle_tags || {};
                  return {
                    cn: Array.isArray(parsed.cn)
                      ? parsed.cn
                      : parsed.cn
                        ? [parsed.cn]
                        : [],
                    global: Array.isArray(parsed.global)
                      ? parsed.global
                      : parsed.global
                        ? [parsed.global]
                        : [],
                  };
                } catch {
                  return { cn: [], global: [] };
                }
              })()}
              <tr class="hover:bg-accent/30 transition-colors group">
                <!-- Player identity -->
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <div
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
                  <span class="text-sm" title={p.flag?.toUpperCase()}>
                    {flagEmoji(p.flag)}
                    <span class="text-xs text-muted-foreground ml-1 uppercase"
                      >{p.flag || "—"}</span
                    >
                  </span>
                </td>

                <!-- BattleTags -->
                <td class="px-5 py-3">
                  <div class="flex flex-wrap gap-1 max-w-[280px]">
                    {#each tags.cn as tag}
                      <Badge
                        variant="secondary"
                        class="text-[10px] font-mono bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0 shrink-0"
                      >
                        CN: {tag}
                      </Badge>
                    {/each}
                    {#each tags.global as tag}
                      <Badge
                        variant="secondary"
                        class="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0 shrink-0"
                      >
                        Global: {tag}
                      </Badge>
                    {/each}
                    {#if tags.cn.length === 0 && tags.global.length === 0}
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
                        : `https://liquipedia.net/starcraft2/${p.link}`}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => openEdit(p)}
                    class="w-7 h-7 opacity-50 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10"
                  >
                    <Edit2Icon class="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            {/each}

            {#if filteredPlayers.length === 0}
              <tr>
                <td colspan="7" class="px-5 py-16 text-center">
                  <div
                    class="flex flex-col items-center gap-2 text-muted-foreground"
                  >
                    <UsersIcon class="w-8 h-8 opacity-30" />
                    <p class="text-sm">
                      {searchQuery ? "没有找到符合条件的选手" : "暂无选手数据"}
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
          class="px-5 py-2.5 border-t border-border/50 bg-muted/20 text-[11px] text-muted-foreground"
        >
          显示 {filteredPlayers.length} / {players.length} 名选手
        </div>
      {/if}
    </div>

    <!-- Mobile Card View -->
    <div class="block sm:hidden space-y-3">
      {#each filteredPlayers as p (p.id)}
        {@const bnetIds = parseBnetIds(p.bnet_ids)}
        {@const tags = (() => {
          try {
            const parsed =
              typeof p.battle_tags === "string"
                ? JSON.parse(p.battle_tags)
                : p.battle_tags || {};
            return {
              cn: Array.isArray(parsed.cn)
                ? parsed.cn
                : parsed.cn
                  ? [parsed.cn]
                  : [],
              global: Array.isArray(parsed.global)
                ? parsed.global
                : parsed.global
                  ? [parsed.global]
                  : [],
            };
          } catch {
            return { cn: [], global: [] };
          }
        })()}
        <div
          class="bg-card border border-border rounded-xl p-4.5 space-y-3 shadow-sm hover:border-primary/30 transition-all"
        >
          <!-- Header: Avatar + Nickname/Team + Edit Button -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <div
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

            <Button
              variant="outline"
              size="icon"
              onclick={() => openEdit(p)}
              class="w-7.5 h-7.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-border"
            >
              <Edit2Icon class="w-3.5 h-3.5" />
            </Button>
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
                <span class="text-sm">{flagEmoji(p.flag)}</span>
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
                      : `https://liquipedia.net/starcraft2/${p.link}`}
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

          <!-- Footer: BattleTags & IP -->
          <div class="grid grid-cols-2 gap-3 pt-1">
            <div class="space-y-1">
              <span class="text-[10px] text-muted-foreground block"
                >BattleTags</span
              >
              <div class="flex flex-wrap gap-1">
                {#each tags.cn as tag}
                  <Badge
                    variant="secondary"
                    class="text-[9px] font-mono bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0"
                  >
                    CN: {tag}
                  </Badge>
                {/each}
                {#each tags.global as tag}
                  <Badge
                    variant="secondary"
                    class="text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0"
                  >
                    Global: {tag}
                  </Badge>
                {/each}
                {#if tags.cn.length === 0 && tags.global.length === 0}
                  <span class="text-[10px] text-muted-foreground/45 italic"
                    >未设置</span
                  >
                {/if}
              </div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-muted-foreground block"
                >上次活跃 IP</span
              >
              <span class="text-[10px] font-mono text-muted-foreground/80 block"
                >{p.last_ip || "—"}</span
              >
            </div>
          </div>
        </div>
      {/each}

      {#if filteredPlayers.length === 0}
        <div
          class="text-center py-12 border border-dashed border-border rounded-xl bg-card/20 flex flex-col items-center justify-center gap-2"
        >
          <UsersIcon class="w-8 h-8 text-muted-foreground/30" />
          <p class="text-xs text-muted-foreground">
            {searchQuery ? "没有找到符合条件的选手" : "暂无选手数据"}
          </p>
        </div>
      {/if}

      {#if filteredPlayers.length > 0}
        <div
          class="text-[11px] text-muted-foreground/80 text-center py-1 bg-muted/10 border border-border rounded-lg"
        >
          显示 {filteredPlayers.length} / {players.length} 名选手
        </div>
      {/if}
    </div>
  {/if}
</div>

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
        配置选手全局档案，包含 ID、显示名称、国籍、战队及关联 Battle.net 账号。
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

      <!-- BattleTags -->
      <div class="space-y-2.5">
        <span class="text-xs font-bold text-muted-foreground"
          >游戏 BattleTags</span
        >
        <div
          class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 border border-border/60 p-4 rounded-xl"
        >
          <!-- CN Server -->
          <div class="space-y-2">
            <span
              class="text-[11px] font-bold text-muted-foreground flex items-center justify-between"
            >
              <span>中国服务器 (CN)</span>
              <span class="text-[10px] text-muted-foreground/60 font-normal"
                >已添加 {editBattleTags.cn.length} 个</span
              >
            </span>

            <!-- Badges list -->
            <div
              class="flex flex-wrap gap-1.5 min-h-[34px] p-2 rounded-lg border border-border bg-background/50"
            >
              {#each editBattleTags.cn as tag, idx}
                <Badge
                  variant="secondary"
                  class="text-[10px] font-mono py-0.5 px-2 bg-muted border border-border/80 text-foreground flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onclick={() =>
                      (editBattleTags.cn = editBattleTags.cn.filter(
                        (_, i) => i !== idx,
                      ))}
                    class="text-muted-foreground hover:text-destructive font-bold text-xs shrink-0 cursor-pointer"
                    >&times;</button
                  >
                </Badge>
              {/each}
              {#if editBattleTags.cn.length === 0}
                <span
                  class="text-[10px] text-muted-foreground/50 italic self-center px-1"
                  >暂无账号</span
                >
              {/if}
            </div>

            <!-- Add input -->
            <div class="flex gap-1.5">
              <Input
                type="text"
                placeholder="例如: Bnet#1234"
                id="add-cn-input"
                class="text-xs h-7.5 bg-background border-border text-foreground flex-1"
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val && !editBattleTags.cn.includes(val)) {
                      editBattleTags.cn = [...editBattleTags.cn, val];
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="w-7.5 h-7.5 border-border shrink-0 cursor-pointer"
                onclick={() => {
                  const input = document.getElementById("add-cn-input");
                  const val = input.value.trim();
                  if (val && !editBattleTags.cn.includes(val)) {
                    editBattleTags.cn = [...editBattleTags.cn, val];
                    input.value = "";
                  }
                }}
              >
                <PlusIcon class="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <!-- Global Server -->
          <div class="space-y-2">
            <span
              class="text-[11px] font-bold text-muted-foreground flex items-center justify-between"
            >
              <span>国际服务器 (Global)</span>
              <span class="text-[10px] text-muted-foreground/60 font-normal"
                >已添加 {editBattleTags.global.length} 个</span
              >
            </span>

            <!-- Badges list -->
            <div
              class="flex flex-wrap gap-1.5 min-h-[34px] p-2 rounded-lg border border-border bg-background/50"
            >
              {#each editBattleTags.global as tag, idx}
                <Badge
                  variant="secondary"
                  class="text-[10px] font-mono py-0.5 px-2 bg-muted border border-border/80 text-foreground flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onclick={() =>
                      (editBattleTags.global = editBattleTags.global.filter(
                        (_, i) => i !== idx,
                      ))}
                    class="text-muted-foreground hover:text-destructive font-bold text-xs shrink-0 cursor-pointer"
                    >&times;</button
                  >
                </Badge>
              {/each}
              {#if editBattleTags.global.length === 0}
                <span
                  class="text-[10px] text-muted-foreground/50 italic self-center px-1"
                  >暂无账号</span
                >
              {/if}
            </div>

            <!-- Add input -->
            <div class="flex gap-1.5">
              <Input
                type="text"
                placeholder="例如: Bnet#9012"
                id="add-global-input"
                class="text-xs h-7.5 bg-background border-border text-foreground flex-1"
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val && !editBattleTags.global.includes(val)) {
                      editBattleTags.global = [...editBattleTags.global, val];
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="w-7.5 h-7.5 border-border shrink-0 cursor-pointer"
                onclick={() => {
                  const input = document.getElementById("add-global-input");
                  const val = input.value.trim();
                  if (val && !editBattleTags.global.includes(val)) {
                    editBattleTags.global = [...editBattleTags.global, val];
                    input.value = "";
                  }
                }}
              >
                <PlusIcon class="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Flag + Team -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label for="edit-flag" class="text-xs font-bold text-muted-foreground"
            >国籍 (Flag)</label
          >
          <Input
            id="edit-flag"
            bind:value={editFlag}
            placeholder="cn / hk / tw"
            class="text-xs h-8"
          />
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
          https://liquipedia.net/starcraft2/&lt;名称&gt;
        </p>
      </div>

      <!-- Battle.net IDs (Read-only from Replay) -->
      <div class="space-y-2 pt-2 border-t border-border/60">
        <span class="text-xs font-bold text-muted-foreground block"
          >自动解析的游戏账号 (只读，来自录像上传)</span
        >
        <div
          class="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-lg border border-border/80 bg-muted/10"
        >
          {#each editBnetIds as b}
            <Badge
              variant="secondary"
              class="text-[10px] font-mono bg-muted/65 border border-border/60 px-2 py-0.5"
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
            </Badge>
          {/each}
          {#if editBnetIds.length === 0}
            <span
              class="text-[10px] text-muted-foreground/50 italic self-center px-1"
              >暂无关联的录像账号，系统将在解析比赛录像时自动匹配并填入。</span
            >
          {/if}
        </div>
      </div>

      <!-- Merge section (edit only) -->
      {#if !isCreating}
        <div class="space-y-2 pt-2 border-t border-border/60">
          <label
            class="text-xs font-bold text-muted-foreground flex items-center gap-1.5"
          >
            <MergeIcon class="w-3.5 h-3.5" />
            合并到其他选手
          </label>
          <div class="flex gap-2">
            <select
              bind:value={mergeTargetId}
              class="flex-1 text-xs h-8 rounded-md bg-muted/40 border border-border px-2 text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">选择目标选手...</option>
              {#each players.filter((p) => p.id !== editingId) as p}
                <option value={p.id}>{p.display_name || p.id} ({p.id})</option>
              {/each}
            </select>
            <Button
              variant="outline"
              size="sm"
              onclick={handleMerge}
              disabled={!mergeTargetId}
              class="text-xs gap-1 h-8 shrink-0"
            >
              <MergeIcon class="w-3.5 h-3.5" />
              执行合并
            </Button>
          </div>
          <p class="text-[10px] text-muted-foreground/60">
            合并后此选手的所有对阵、报名、投票数据将转移到目标选手，并删除此选手。
          </p>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="flex items-center gap-2 pt-1">
      {#if !isCreating}
        <Button
          variant="destructive"
          size="sm"
          onclick={handleDelete}
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
