import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { useOpenCallFromNotifications, usePushSetup } from '../lib/notifications';
import { PushStatusContext } from '../lib/pushStatus';

// Интерфейс на иврите — справа налево. В браузере это задаёт public/index.html,
// в нативных сборках — I18nManager (вступает в силу после перезапуска приложения).
if (Platform.OS !== 'web' && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { loading, user } = useAuth();
  // Уведомления о вызовах нужны только участникам.
  const pushStatus = usePushSetup(user?.role === 'participant' ? user.id : null);
  useOpenCallFromNotifications(!!user);

  if (loading) return <Loading />;
  const isDispatcher = user?.role === 'dispatcher';
  const isParticipant = user?.role === 'participant';

  return (
    <PushStatusContext.Provider value={pushStatus}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { fontWeight: '700' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="register" options={{ title: 'הרשמה' }} />
        </Stack.Protected>
        <Stack.Protected guard={isDispatcher}>
          <Stack.Screen name="dispatcher" options={{ title: 'מוקדן' }} />
          <Stack.Screen name="place" options={{ title: 'ציון מקום' }} />
          <Stack.Screen name="teams" options={{ title: 'בחירת צוות' }} />
          <Stack.Screen name="team" options={{ title: 'ניהול צוות' }} />
          <Stack.Screen name="add-member" options={{ title: 'הוספת חבר צוות' }} />
          <Stack.Screen name="move/[userId]" options={{ title: 'העברה לצוות' }} />
        </Stack.Protected>
        <Stack.Protected guard={isParticipant}>
          <Stack.Screen name="participant" options={{ title: 'חבר צוות' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="call/[id]" options={{ title: 'קריאה' }} />
          <Stack.Screen name="profile" options={{ title: 'פרופיל' }} />
          <Stack.Screen name="history" options={{ title: 'היסטוריית קריאות' }} />
        </Stack.Protected>
      </Stack>
    </PushStatusContext.Provider>
  );
}
