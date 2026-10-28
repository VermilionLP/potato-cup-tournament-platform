// The visitor's player identity: device key binding (apps/api/lib/player-key.js).
// The first device that uses an ID binds a key to it; other devices need that
// key to act for the ID.
import { toast } from "svelte-sonner";
import { API } from "./api.js";
import { openProfile } from "./profile-prompt.js";
import { userState } from "./user.svelte.js";

export function notifyKeyConflict() {
  userState.keyConflict = true;
  toast.warning("这个选手 ID 已绑定其他设备，这台设备暂时不能报名、投票或修改资料。", {
    id: "player-key",
    description: "在已绑定的设备上打开「个人资料」复制设备密钥，再到这里导入。",
    action: { label: "导入密钥", onClick: () => openProfile() },
    duration: 12000,
  });
}

/** Binds a key to `id` on this device unless it already has one. */
export async function ensurePlayerKey(id) {
  if (!id || userState.keys[id]) return;
  try {
    const res = await API.claimPlayerKey(id);
    if (res.key) userState.setKey(id, res.key);
  } catch (e) {
    if (e.status === 409) notifyKeyConflict();
    // 404: the player has no record yet; bound on the next visit.
  }
}
