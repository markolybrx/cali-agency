import { LocalNotifications } from '@capacitor/local-notifications';

let wakeLockSentinel: { release: () => Promise<void> } | null = null;
let notifCounter = 100;

export async function acquireScreenWakeLock(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && !wakeLockSentinel) {
      wakeLockSentinel = await nav.wakeLock.request('screen');
      return true;
    }
  } catch {
    // Wake lock not supported or blocked
  }
  return false;
}

export async function releaseScreenWakeLock(): Promise<void> {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    wakeLockSentinel = null;
  }
}

export async function sendAgencyNotification(title: string, body: string): Promise<void> {
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
    notifCounter += 1;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifCounter,
          title,
          body,
          schedule: { at: new Date(Date.now() + 250) }
        }
      ]
    });
    return;
  } catch {
    // Fallback to Web Notification API on browser/Vercel
  }

  try {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  } catch {
    // ignore
  }
}
