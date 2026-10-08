import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

/** Должен совпадать с ANDROID_CHANNEL_ID на сервере. */
export const CALL_CHANNEL_ID = 'calls';

// Уведомления показываются и при открытом приложении: баннер, звук, вибрация.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
    name: 'Вызовы',
    description: 'Срочные вызовы команды',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // Режим «Не беспокоить» не обходится (п.8 ТЗ).
    bypassDnd: false,
  });
}

function projectId(): string | undefined {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return id || undefined;
}

/**
 * Запрашивает разрешение на уведомления и отправляет push-токен устройства
 * на сервер. Возвращает текст проблемы или null, если всё в порядке.
 */
export async function registerForPush(): Promise<string | null> {
  await ensureAndroidChannel();
  if (!Device.isDevice) return 'Push-уведомления работают только на реальном устройстве';

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return 'Разрешите уведомления в настройках телефона, иначе вызовы не будут приходить';

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await api.setPushToken(data);
    return null;
  } catch (err) {
    return `Не удалось зарегистрировать устройство для уведомлений: ${err instanceof Error ? err.message : err}`;
  }
}

export function callIdFromNotification(notification: Notifications.Notification): number | null {
  const data = notification.request.content.data as { type?: string; callId?: unknown } | undefined;
  if (data?.type !== 'call') return null;
  const id = Number(data.callId);
  return Number.isInteger(id) ? id : null;
}
