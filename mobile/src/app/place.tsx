import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Muted, Screen } from '../components/ui';
import { api, errorMessage } from '../lib/api';

export default function Place() {
  const [other, setOther] = useState(false);
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (data: { kind: 'car' } | { kind: 'place'; place: string }) => {
    setBusy(true);
    setError(null);
    try {
      const call = await api.sendCall(data);
      router.replace({ pathname: '/call/[id]', params: { id: String(call.id) } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Muted>Выберите место встречи. Вызов будет отправлен выбранной команде сразу после выбора.</Muted>
      <Button title="🚑 К машине" variant="danger" big onPress={() => send({ kind: 'car' })} disabled={busy} />
      <Button title="📍 Другое" big variant={other ? 'primary' : 'secondary'} onPress={() => setOther(true)} />
      {other ? (
        <>
          <Field
            label="Место встречи"
            value={place}
            onChangeText={setPlace}
            placeholder="Например: главный вход, 2 этаж"
            autoFocus
            maxLength={200}
            returnKeyType="send"
            onSubmitEditing={() => place.trim() && send({ kind: 'place', place: place.trim() })}
          />
          <Button
            title="ОТПРАВИТЬ ВЫЗОВ"
            variant="danger"
            big
            busy={busy}
            disabled={!place.trim()}
            onPress={() => send({ kind: 'place', place: place.trim() })}
          />
        </>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
