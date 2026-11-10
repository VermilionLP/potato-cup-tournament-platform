// Browser push subscription for match reminders (service worker /sw.js,
// API routes/push.js).
import { API } from "./api.js";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone / iPad Safari: notifications only from the site added to the home screen. */
export function needsHomeScreen(nav = typeof navigator === "undefined" ? null : navigator, win = typeof window === "undefined" ? null : window) {
  if (!nav || !win) return false;
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || win.matchMedia?.("(display-mode: standalone)")?.matches;
  return ios && !standalone;
}

/** "ios-install" | "unsupported" | "denied" | "off" | "on" (pass whether subscribed). */
export function pushStatus(subscribed) {
  if (!pushSupported()) return needsHomeScreen() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return subscribed ? "on" : "off";
}

/** Asks the server to send this browser a test notification. */
export async function sendTestPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) throw Object.assign(new Error("这个浏览器还没有开启通知"), { plain: true });
  await API.subscribePush(subscription.toJSON());
  await API.testPush(subscription.endpoint);
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Whether this browser is subscribed. Re-sends the subscription so the
 * backend still has it after a database reset.
 */
export async function pushIsEnabled() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await API.subscribePush(subscription.toJSON()).catch(() => {});
    return Boolean(subscription);
  } catch {
    return false;
  }
}

/** Asks for permission and subscribes; throws with a message on failure. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw Object.assign(new Error("通知权限被拒绝，请在浏览器设置里允许通知"), { plain: true });
  }
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await API.getPushPublicKey();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await API.subscribePush(subscription.toJSON());
}

export async function disablePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await API.unsubscribePush(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
  }
}
