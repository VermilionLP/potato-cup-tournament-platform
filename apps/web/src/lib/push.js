// Browser push subscription for match reminders (service worker /sw.js,
// API routes/push.js).
import { API } from "./api.js";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
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
