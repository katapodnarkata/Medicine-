import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorText, Label, ListItem, Muted, Screen, StatusBadge, Title } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatRemaining } from '../lib/format';
import { useNow, usePolling } from '../lib/hooks';
import { usePushProblem } from '../lib/pushStatus';

export default function ParticipantHome() {
  const { user, refresh } = useAuth();
  const now = useNow();
  const pushProblem = usePushProblem();
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
        <Title>{user?.team ? user.team.name : 'Вы не состоите в команде'}</Title>
        {!user?.team ? <Muted>Выберите команду в профиле или попросите диспетчера добавить вас.</Muted> : null}
      </Card>
      {pushProblem ? (
        <Card style={{ backgroundColor: '#FFF4E5' }}>
          <Muted>⚠️ {pushProblem}</Muted>
        </Card>
      ) : null}

      <Label>Активные вызовы</Label>
      {active.length === 0 ? <Muted>Сейчас вызовов нет. При вызове придёт уведомление.</Muted> : null}
      {active.map((c) => (
        <ListItem
          key={c.id}
          title={c.text.replace('\n', ' ')}
          subtitle={`осталось ${formatRemaining(c.expiresAt - now)}`}
          right={<StatusBadge seen={c.myStatus === 'seen'} />}
          onPress={() => router.push({ pathname: '/call/[id]', params: { id: String(c.id) } })}
        />
      ))}
      <ErrorText>{error}</ErrorText>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title="История вызовов" variant="secondary" onPress={() => router.push('/history')} />
        <Button title="Профиль" variant="secondary" onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}
