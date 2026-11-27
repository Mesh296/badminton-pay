import { fromBase64Url } from "../shared/base64url";
import { errorMessage, sendWrite } from "./api";

// Notifications on this device for the signed-in member, so their phone rings
// when someone reports paying them. iPhone offers them only to the app added
// to the home screen (iOS 16.4 and later), never to a Safari tab.

export type PushStatus = "unsupported" | "blocked" | "off" | "on";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The notification-only service worker (public/sw.js). */
export function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  return supported() ? (await navigator.serviceWorker.ready).pushManager.getSubscription() : null;
}

export async function readStatus(): Promise<PushStatus> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && (await currentSubscription()) ? "on" : "off";
}

/**
 * Tells the server again about this device's subscription, if it has one: it
 * then rings for whoever is signed in now, and the server learns the app's
 * address for the evening reminder. Quiet; run when a member opens the app.
 */
export async function resyncPush(): Promise<void> {
  if (!supported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) await sendWrite("POST", "/api/push", subscription.toJSON()).catch(() => undefined);
}

/** Stops this device ringing for whoever is signed in. Also run before signing out. */
export async function turnOffPush(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  await sendWrite("DELETE", "/api/push", { endpoint: subscription.endpoint }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

export async function turnOn(): Promise<PushStatus> {
  // First, while the tap still counts as the user's: iPhone asks only then.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const keyRes = await fetch("/api/push/key");
  if (!keyRes.ok) throw new Error(await errorMessage(keyRes));
  const { key } = (await keyRes.json()) as { key: string };
  // A fresh subscription each time, so a changed server key never leaves a dead one.
  await turnOffPush();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(key),
  });
  const res = await sendWrite("POST", "/api/push", subscription.toJSON());
  if (!res.ok) {
    await subscription.unsubscribe();
    throw new Error(await errorMessage(res));
  }
  return "on";
}
