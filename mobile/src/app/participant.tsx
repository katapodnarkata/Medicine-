import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorText, Label, ListItem, Muted, PushBanner, Screen, StatusBadge, Title } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatRemaining } from '../lib/format';
import { useNow, usePolling } from '../lib/hooks';
import { usePushStatus } from '../lib/pushStatus';

export default function ParticipantHome() {
  const { user, refresh } = useAuth();
  const now = useNow();
  const pushStatus = usePushStatus();
  const load = useCallback(async () => {
    // Обновляем профиль: диспетчер мог перевести участника в другую команду.
    await refresh().catch(() => undefined);
    return api.activeCalls();
  }, [refresh]);
  const { data: calls, error, loading, reload } = usePolling(load, 10000);
  const active = (calls ?? []).filter((c) => c.expiresAt > now);

  return (
    <Screen refreshing={loading && !!calls} onRefresh={reload}>
      <Card>
        <Label>{user?.name}</Label>
        <Title>{user?.team ? user.team.name : 'אינך משויך/ת לצוות'}</Title>
        {!user?.team ? <Muted>אפשר לבחור צוות בפרופיל או לבקש מהמוקדן להוסיף אותך.</Muted> : null}
      </Card>
      <PushBanner problem={pushStatus.problem} enable={pushStatus.enable} />

      <Label>קריאות פעילות</Label>
      {active.length === 0 ? <Muted>אין קריאות כרגע. כשתגיע קריאה תתקבל התראה.</Muted> : null}
      {active.map((c) => (
        <ListItem
          key={c.id}
          title={c.text.replace('\n', ' ')}
          subtitle={`נותרו ${formatRemaining(c.expiresAt - now)}`}
          right={<StatusBadge seen={c.myStatus === 'seen'} />}
          onPress={() => router.push({ pathname: '/call/[id]', params: { id: String(c.id) } })}
        />
      ))}
      <ErrorText>{error}</ErrorText>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title="היסטוריית קריאות" variant="secondary" onPress={() => router.push('/history')} />
        <Button title="פרופיל" variant="secondary" onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}
