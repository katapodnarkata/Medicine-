import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  colors,
  ErrorText,
  Label,
  ListItem,
  Loading,
  Muted,
  Screen,
  StatusBadge,
} from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatRemaining } from '../../lib/format';
import { useNow, usePolling } from '../../lib/hooks';
import type { Call } from '../../lib/types';

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isDispatcher = user?.role === 'dispatcher';
  const load = useCallback(() => api.call(Number(id)), [id]);
  // Диспетчер видит статусы получателей почти в реальном времени.
  const { data: call, error, setData } = usePolling(load, isDispatcher ? 2000 : 10000);

  if (!call) {
    return <Screen>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  }
  return isDispatcher ? <DispatcherView call={call} /> : <ParticipantView call={call} onUpdate={setData} />;
}

function CallText({ call }: { call: Call }) {
  return <Text style={styles.callText}>{call.text}</Text>;
}

function CallState({ call }: { call: Call }) {
  const now = useNow();
  const active = call.active && call.expiresAt > now;
  const { date, time } = formatDateTime(call.createdAt);
  return (
    <Muted>
      {date} {time} · {call.teamName} · {active ? `активен ещё ${formatRemaining(call.expiresAt - now)}` : 'завершён'}
    </Muted>
  );
}

/** Экран вызова участника (п.9): текст вызова и большая кнопка «Я УВИДЕЛ». */
function ParticipantView({ call, onUpdate }: { call: Call; onUpdate: (call: Call) => void }) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = call.active && call.expiresAt > now;
  const seen = call.myStatus === 'seen';

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await api.ack(call.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={styles.participantTop}>
        <CallText call={call} />
        <CallState call={call} />
      </View>
      <ErrorText>{error}</ErrorText>
      {seen ? (
        <View style={styles.confirmed}>
          <Text style={styles.confirmedText}>✓ ВЫ ПОДТВЕРДИЛИ</Text>
        </View>
      ) : active ? (
        <Button title="Я УВИДЕЛ" variant="success" big busy={busy} onPress={acknowledge} style={styles.ackButton} />
      ) : (
        <Muted>Вызов завершён.</Muted>
      )}
    </Screen>
  );
}

/** Экран активного вызова диспетчера (п.17): текст, получатели и их статусы. */
function DispatcherView({ call }: { call: Call }) {
  const recipients = call.recipients;
  const seenCount = recipients?.filter((r) => r.status === 'seen').length ?? 0;
  return (
    <Screen>
      <Card>
        <CallText call={call} />
        <CallState call={call} />
        <Muted>Диспетчер: {call.dispatcherName}</Muted>
      </Card>
      {recipients ? (
        <>
          <Label>
            Получатели · увидели {seenCount} из {recipients.length}
          </Label>
          {recipients.map((r) => (
            <ListItem
              key={r.userId}
              title={r.name}
              subtitle={r.smsSent ? `${r.phone} · отправлено SMS` : r.phone}
              right={<StatusBadge seen={r.status === 'seen'} />}
            />
          ))}
        </>
      ) : (
        <Muted>Данные о получателях хранятся 24 часа и уже удалены.</Muted>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  callText: { fontSize: 30, fontWeight: '800', color: colors.text, lineHeight: 42 },
  participantTop: { flex: 1, justifyContent: 'center', gap: 16 },
  ackButton: { minHeight: 160, marginBottom: 16 },
  confirmed: {
    minHeight: 120,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: colors.greenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedText: { fontSize: 24, fontWeight: '800', color: colors.green },
});
