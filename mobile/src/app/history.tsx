import { router } from 'expo-router';
import { Card, ErrorText, Label, Loading, Muted, Screen, Title } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { usePolling } from '../lib/hooks';
import { Pressable } from 'react-native';

/** История вызовов за последние 3 дня (п.14). */
export default function History() {
  const { user } = useAuth();
  const { data: calls, error, loading, reload } = usePolling(api.history);
  const isDispatcher = user?.role === 'dispatcher';

  return (
    <Screen refreshing={loading && !!calls} onRefresh={reload}>
      <Muted>Вызовы за последние 3 дня. Статусы получателей хранятся 24 часа.</Muted>
      <ErrorText>{error}</ErrorText>
      {!calls && !error ? <Loading /> : null}
      {calls?.length === 0 ? <Muted>Вызовов нет.</Muted> : null}
      {calls?.map((c) => {
        const { date, time } = formatDateTime(c.createdAt);
        const seen = c.recipients?.filter((r) => r.status === 'seen').length;
        const canOpen = isDispatcher && !!c.recipients;
        return (
          <Pressable
            key={c.id}
            disabled={!canOpen}
            onPress={() => router.push({ pathname: '/call/[id]', params: { id: String(c.id) } })}
          >
            <Card>
              <Label>
                {date} · {time} · {c.teamName}
              </Label>
              <Title>{c.text}</Title>
              <Muted>Диспетчер: {c.dispatcherName}</Muted>
              {c.recipients ? (
                <Muted>
                  Увидели {seen} из {c.recipients.length}
                  {c.active ? ' · активен' : ''}
                </Muted>
              ) : null}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
