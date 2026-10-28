<script>
  // Identity dialog behind the header's profile button: sign in (player ID
  // plus a required QQ / Discord contact) for visitors, profile editing and
  // the device key for signed-in players. Open it with openDialog().
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import { ensurePlayerKey } from "$lib/player-session.js";
  import { buildContact, contactInputProblem, parseContact, requiredContactProblem, splitContactInput } from "$lib/contact.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import UserRoundIcon from "@lucide/svelte/icons/user-round";
  import GuestSignInFields from "./GuestSignInFields.svelte";
  import ProfileFields from "./ProfileFields.svelte";
  import DeviceKeyCard from "./DeviceKeyCard.svelte";

  let open = $state(false);
  let busy = $state(false);
  let idInput = $state("");

  // Visitor sign-in
  let contactInput = $state("");
  let contactError = $state("");
  let existingPlayers = $state([]);

  // Profile of the signed-in player
  let flag = $state("cn");
  let team = $state("");
  let link = $state("");
  let contactBase = $state({}); // untouched battle_tags keys kept across saves
  let qq = $state("");
  let discord = $state("");

  export async function openDialog() {
    idInput = userState.id || "";
    contactInput = userState.qqGroup || "";
    contactError = "";
    open = true;

    if (userState.id) {
      try {
        const p = await API.getPlayer(userState.id);
        if (p) {
          flag = p.flag || "cn";
          team = p.team || "";
          link = p.link || "";
          const contact = parseContact(p.battle_tags);
          contactBase = contact.base;
          qq = contact.qq;
          discord = contact.discord;
        }
      } catch (e) {
        console.error("获取选手资料失败:", e);
        toast.error("获取选手资料失败: " + e.message);
      }
    } else {
      try {
        existingPlayers = await API.listPlayers();
      } catch (e) {
        console.error("加载选手列表失败:", e);
      }
    }
  }

  const reload = () => setTimeout(() => window.location.reload(), 100);

  // Writes the contact typed at sign-in onto the player profile. Only the
  // channel that was typed is replaced, so an existing QQ or Discord value
  // is never wiped by the other one.
  async function saveSignInContact(playerId, rawContact) {
    const parsed = splitContactInput(rawContact);
    if (!parsed.qq && !parsed.discord) return;

    let player = existingPlayers.find((p) => p.id === playerId);
    if (!player) {
      try {
        player = await API.getPlayer(playerId);
      } catch {
        player = null;
      }
    }

    const current = parseContact(player?.battle_tags);
    const nextQQ = parsed.qq || current.qq;
    const nextDiscord = parsed.discord || current.discord;
    if (nextQQ === current.qq && nextDiscord === current.discord) return;

    await API.updatePlayer(playerId, {
      flag: player?.flag || "cn",
      team: player?.team || "",
      link: player?.link || "",
      battle_tags: buildContact(current.base, { qq: nextQQ, discord: nextDiscord }),
    });
  }

  // Sign in: a player ID plus a required contact (QQ number or Discord
  // user name), which is saved to the player's profile.
  async function signIn() {
    const trimmedContact = contactInput.trim();
    const trimmedId = idInput.trim();
    contactError = contactInputProblem(trimmedContact);
    if (contactError) return;
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    busy = true;
    try {
      userState.setQQGroup(trimmedContact);
      userState.setId(trimmedId);
      try {
        await API.touchPlayer(trimmedId);
      } catch (e) {
        console.warn("touch player failed:", e);
      }
      await ensurePlayerKey(trimmedId);
      try {
        await saveSignInContact(trimmedId, trimmedContact);
      } catch (e) {
        // A device-key conflict is explained by its own prompt.
        if (e.code !== "PLAYER_KEY_REQUIRED") {
          contactError = e.message;
          toast.error("联系方式保存失败: " + e.message);
          return;
        }
      }
      open = false;
      toast.success("身份配置已保存！");
      reload();
    } finally {
      busy = false;
    }
  }

  async function saveProfile() {
    const trimmedId = idInput.trim();
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    // 1. Player ID rename (admins only; history follows the new ID)
    const oldId = userState.id;
    if (trimmedId !== oldId) {
      if (!userState.adminToken) {
        toast.error("修改选手 ID 需要管理员权限，请先点击右上角盾牌图标登录");
        return;
      }
      const confirmed = confirm(
        `确定要将选手 ID 从 "${oldId}" 修改为 "${trimmedId}" 吗？\n此操作将同步更新所有历史赛事对阵、报名和投票数据。`,
      );
      if (!confirmed) return;

      busy = true;
      try {
        await API.renamePlayer(oldId, trimmedId);
        userState.moveKey(oldId, trimmedId);
        userState.setId(trimmedId);
        toast.success("选手 ID 修改成功！");
      } catch (err) {
        toast.error("修改选手 ID 失败: " + err.message);
        return;
      } finally {
        busy = false;
      }
    }

    // 2. Profile details (a contact is required)
    const problem = requiredContactProblem({ qq: qq.trim(), discord: discord.trim() });
    if (problem) {
      toast.error(problem);
      return;
    }
    busy = true;
    try {
      await API.updatePlayer(trimmedId, {
        flag: flag || "cn",
        team: team || "",
        link: link || "",
        battle_tags: buildContact(contactBase, { qq, discord }),
      });
      toast.success("个人资料保存成功！");
      open = false;
      reload();
    } catch (err) {
      toast.error("保存个人资料失败: " + err.message);
    } finally {
      busy = false;
    }
  }

  function signOut() {
    userState.setId("");
    userState.setQQGroup("");
    idInput = "";
    contactInput = "";
    open = false;
    toast.success("已退出身份，目前为只读查看模式");
    reload();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="{userState.id ? 'max-w-125' : 'max-w-85 sm:max-w-95'} bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
        <UserRoundIcon class="w-5 h-5 text-primary" />
        {userState.id ? "完善个人资料" : "身份与联系方式验证"}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if userState.id}
          修改您的游戏昵称、QQ / Discord 联系方式及关联 Wiki。
        {:else}
          填写您的 QQ 号或 Discord 用户名（联系方式）与游戏昵称 ID，以解锁创建、报名和修改权限。
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if userState.id}
      <ProfileFields bind:idInput bind:qq bind:discord bind:flag bind:team bind:link />
      <DeviceKeyCard />
    {:else}
      <GuestSignInFields bind:idInput bind:contactInput {contactError} players={existingPlayers} onsubmit={signIn} />
    {/if}

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      {#if userState.id || userState.qqGroup}
        <Button variant="destructive" size="sm" onclick={signOut} class="w-full sm:w-auto text-xs">退出当前身份</Button>
      {/if}
      <div class="flex-1"></div>
      <Button variant="outline" size="sm" onclick={() => (open = false)} class="w-full sm:w-auto text-xs">取消</Button>
      <Button size="sm" onclick={userState.id ? saveProfile : signIn} disabled={busy} class="w-full sm:w-auto text-xs font-semibold">
        {#if busy}正在保存...{:else}保存{/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
