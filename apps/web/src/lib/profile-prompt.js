// Actions that need a player identity first: when the contact or player ID
// is missing, explain it and open the profile dialog in the header.
import { toast } from "svelte-sonner";
import { userState } from "./user.svelte.js";

/** True (and the profile dialog opened) when the visitor has no identity yet. */
export function needsProfile() {
  if (userState.qqGroup && userState.id) return false;
  toast.error("此操作需要先填写 QQ / Discord 联系方式与选手 ID。已为您打开配置面板！");
  openProfile();
  return true;
}

export function openProfile() {
  document.getElementById("header-profile-button")?.click();
}
