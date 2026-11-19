<script>
  // Create / edit a player profile from the player list. Players edit their
  // own profile; admins edit anyone, rename IDs, merge, delete and reset the
  // device key (PlayerAdminTools, loaded only for admins). Open with
  // openCreate() or openEdit(player). Three tabs like the profile dialog:
  // basic profile, linked accounts (Statshark with what was read — admins —,
  // Liquipedia) and, for admins editing a player, management (device key,
  // merge).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { userState } from "#lib/user.svelte.js";
  import { buildContact, contactProblem, parseContact, requiredContactProblem } from "#lib/contact.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import Flag from "#lib/components/Flag.svelte";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import { lazy } from "#lib/lazy.js";
  import { normalizeStatsharkId } from "@potato-cup/shared/spaded.js";
  import IdCardIcon from "@lucide/svelte/icons/id-card";
  import LinkIcon from "@lucide/svelte/icons/link";
  import WrenchIcon from "@lucide/svelte/icons/wrench";

  const loadAdminTools = lazy(() => import("./PlayerAdminTools.svelte"));
  const loadSpadedPanel = lazy(() => import("./PlayerSpadedPanel.svelte"));

  let { players = [], isAdmin = false, onchanged } = $props();

  let open = $state(false);
  let isCreating = $state(false);
  let editingId = $state("");
  let newId = $state("");
  let flag = $state("cn");
  let team = $state("");
  let link = $state("");
  let contactBase = $state({});
  let qq = $state("");
  let discord = $state("");
  let statshark = $state("");
  let savedStatshark = $state(""); // the id saved, whose read result the panel shows
  let spadedError = $state("");
  let tab = $state("basic");
  const tabs = $derived([
    { id: "basic", label: "基本资料", Icon: IdCardIcon },
    { id: "accounts", label: "关联账号", Icon: LinkIcon, dot: Boolean(spadedError) },
    ...(!isCreating && isAdmin ? [{ id: "manage", label: "管理", Icon: WrenchIcon }] : []),
  ]);
  // In-page confirmation ('merge' | 'delete' | 'rename-self' | 'reset-key' |
  // null). The native confirm() returns false without showing anything once
  // a browser blocks the site's dialogs, which made these buttons silently
  // do nothing.
  let pendingAction = $state(null);

  function needsIdentity() {
    if (userState.qqGroup && userState.id) return false;
    toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。");
    document.getElementById("header-profile-button")?.click();
    return true;
  }

  export function openCreate() {
    if (!isAdmin) {
      toast.error("新增选手需要管理员权限，请先点击右上角盾牌图标登录");
      return;
    }
    if (needsIdentity()) return;
    isCreating = true;
    editingId = "";
    newId = "";
    flag = "cn";
    team = "";
    link = "";
    contactBase = {};
    qq = "";
    discord = "";
    statshark = "";
    savedStatshark = "";
    spadedError = "";
    tab = "basic";
    pendingAction = null;
    open = true;
  }

  export function openEdit(p) {
    if (!isAdmin && p.id !== userState.id) {
      toast.error("编辑其他选手需要管理员权限，请先点击右上角盾牌图标登录");
      return;
    }
    if (needsIdentity()) return;
    isCreating = false;
    editingId = p.id;
    newId = p.id;
    flag = p.flag || "cn";
    team = p.team || "";
    link = p.link || "";
    const contact = parseContact(p.battle_tags);
    contactBase = contact.base;
    qq = contact.qq;
    discord = contact.discord;
    statshark = p.statshark_id || "";
    savedStatshark = p.statshark_id || "";
    spadedError = p.spaded_error || "";
    tab = "basic";
    pendingAction = null;
    open = true;
  }

  async function save() {
    const cleanNewId = newId.trim();
    if (!cleanNewId) {
      toast.error("选手 ID 不能为空");
      return;
    }
    // Contact: always well-formed; required when players edit themselves.
    const contact = { qq: qq.trim(), discord: discord.trim() };
    const contactIssue = isAdmin ? contactProblem(contact) : requiredContactProblem(contact);
    if (contactIssue) {
      toast.error(contactIssue);
      tab = "basic";
      return;
    }
    if (normalizeStatsharkId(statshark) === null) {
      toast.error("Statshark ID 应为数字，或者粘贴 Statshark 个人页面链接");
      tab = "accounts";
      return;
    }

    try {
      if (isCreating) {
        if (players.some((p) => p.id.toLowerCase() === cleanNewId.toLowerCase())) {
          toast.error("选手 ID 已存在");
          return;
        }
        toast.loading("正在创建选手...", { id: "ps" });
        editingId = cleanNewId;
      } else if (cleanNewId !== editingId) {
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
          userState.moveKey(editingId, cleanNewId);
          userState.setId(cleanNewId);
        }
        editingId = cleanNewId;
      } else {
        toast.loading("正在更新资料...", { id: "ps" });
      }

      await API.updatePlayer(editingId, {
        flag,
        team,
        link,
        battle_tags: buildContact(contactBase, { qq, discord }),
        statshark_id: normalizeStatsharkId(statshark) ?? "",
      });

      toast.dismiss("ps");
      toast.success(isCreating ? "选手创建成功" : "资料更新成功");
      open = false;
      const isMe = editingId === userState.id;
      await onchanged?.();
      if (isMe) setTimeout(() => window.location.reload(), 100);
    } catch (e) {
      toast.dismiss("ps");
      toast.error("操作失败: " + e.message);
    }
  }

  async function remove() {
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
      open = false;
      await onchanged?.();
    } catch (e) {
      toast.dismiss("pd");
      toast.error("删除失败: " + e.message);
    }
  }

  // After a merge from the admin tools: the merged player is gone.
  async function merged(from) {
    open = false;
    await onchanged?.({ removed: from });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-[500px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground flex items-center gap-2">
        <SettingsIcon class="w-4 h-4 text-brand-ink" />
        {isCreating ? "新建选手资料" : `编辑 · ${editingId}`}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        配置选手全局档案：ID、联系方式、国籍和战队；关联 Statshark 和 Liquipedia；设备密钥与合并。
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex gap-1 border-b border-border" role="tablist" aria-label="选手资料">
      {#each tabs as t (t.id)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onclick={() => (tab = t.id)}
          class="-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-2 text-xs font-semibold transition-colors cursor-pointer sm:px-2.5
            {tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
        >
          <t.Icon class="h-3.5 w-3.5 max-sm:hidden" />{t.label}
          {#if t.dot}<span class="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>{/if}
        </button>
      {/each}
    </div>

    <div class="min-h-64 space-y-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
      {#if tab === "basic"}
        <div class="space-y-1">
          <label for="edit-new-id" class="text-small font-semibold text-muted-foreground">选手 ID *</label>
          <Input id="edit-new-id" bind:value={newId} placeholder="例如: Vermilion" class="bg-background" />
          <p class="text-small text-muted-foreground/60">选手的唯一 ID 标识，若修改将同步更新其历史对阵、报名和投票数据。</p>
        </div>

        <div class="space-y-1">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label for="edit-contact-qq" class="text-small font-semibold text-muted-foreground">QQ 号</label>
              <Input id="edit-contact-qq" bind:value={qq} placeholder="例如: 123456789" class="bg-background" />
            </div>
            <div class="space-y-1">
              <label for="edit-contact-discord" class="text-small font-semibold text-muted-foreground">Discord 用户名</label>
              <Input id="edit-contact-discord" bind:value={discord} placeholder="例如: username" class="bg-background" />
            </div>
          </div>
          <p class="text-small text-muted-foreground/60">赛务联系用，会显示在选手列表中。</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="edit-flag" class="text-small font-semibold text-muted-foreground">国籍 (Flag)</label>
            <div class="flex items-center gap-2">
              <Flag code={flag} size={20} />
              <Input id="edit-flag" bind:value={flag} placeholder="cn / hk / tw / xx（白旗）" class="flex-1" />
            </div>
          </div>
          <div class="space-y-1">
            <label for="edit-team" class="text-small font-semibold text-muted-foreground">战队</label>
            <Input id="edit-team" bind:value={team} placeholder="战队缩写" />
          </div>
        </div>
      {:else if tab === "accounts"}
        <div class="space-y-1">
          <label for="edit-statshark" class="text-small font-semibold text-muted-foreground">Statshark ID（可选）</label>
          <Input id="edit-statshark" bind:value={statshark} placeholder="例如: 67556271，或粘贴 statshark.net/player/… 链接" class="bg-background" />
          <p class="text-small text-muted-foreground/60">statshark.net 个人页面链接里 /player/ 后面的数字。改了 ID 要先保存，再读取。</p>
        </div>
        {#if !isCreating && isAdmin && editingId}
          {#await loadSpadedPanel() then m}
            <m.default playerId={editingId} savedId={savedStatshark} />
          {/await}
        {/if}

        <div class="space-y-1">
          <label for="edit-link" class="text-small font-semibold text-muted-foreground">Wiki 页面名称</label>
          <Input id="edit-link" bind:value={link} placeholder="例如: Vermilion" />
          <p class="text-small text-muted-foreground/60">
            Liquipedia Wiki 页面名称，最终将链接至
            https://liquipedia.net/warthunder/&lt;名称&gt;
          </p>
        </div>
      {:else if tab === "manage" && !isCreating && isAdmin && editingId}
        <!-- Device key and merge (admin, edit only) -->
        {#await loadAdminTools() then m}
          <m.default playerId={editingId} {players} bind:pendingAction onmerged={merged} />
        {/await}
      {/if}
    </div>

    {#if pendingAction === "delete" || pendingAction === "rename-self"}
      <div class="rounded-lg border p-2.5 space-y-2 {pendingAction === 'delete' ? 'border-destructive/40 bg-destructive/10' : 'border-amber-500/40 bg-amber-500/10'}">
        <p class="text-xs font-semibold {pendingAction === 'delete' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}">
          {#if pendingAction === "delete"}
            确定要删除选手 <span class="num">{editingId}</span> 吗？若已出现在对阵记录中，请改用"合并"功能。
          {:else}
            修改你自己的选手 ID 会同时更新你的登录凭证，确定要改成 <span class="num">{newId.trim()}</span> 吗？
          {/if}
        </p>
        <div class="flex gap-2 justify-end">
          <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => (pendingAction = null)}>取消</Button>
          {#if pendingAction === "delete"}
            <Button variant="destructive" size="sm" class="h-7 text-xs gap-1" onclick={remove}>
              <TrashIcon class="w-3.5 h-3.5" />
              确认删除
            </Button>
          {:else}
            <Button size="sm" class="h-7 text-xs" onclick={save}>确认修改</Button>
          {/if}
        </div>
      </div>
    {/if}

    <Dialog.Footer class="flex items-center gap-2 pt-1">
      {#if !isCreating && isAdmin}
        <Button variant="destructive" size="sm" onclick={remove} disabled={pendingAction === "delete"} class="text-xs gap-1 mr-auto">
          <TrashIcon class="w-3.5 h-3.5" />
          删除
        </Button>
      {/if}
      <Button variant="outline" size="sm" onclick={() => (open = false)} class="text-xs">取消</Button>
      <Button size="sm" onclick={save} class="text-xs font-bold">{isCreating ? "创建" : "保存"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
