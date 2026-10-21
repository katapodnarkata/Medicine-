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
      <Muted>בחרו מקום מפגש. הקריאה תישלח לצוות הנבחר מיד לאחר הבחירה.</Muted>
      <Button title="🚑 לאמבולנס" variant="danger" big onPress={() => send({ kind: 'car' })} disabled={busy} />
      <Button title="📍 אחר" big variant={other ? 'primary' : 'secondary'} onPress={() => setOther(true)} />
      {other ? (
        <>
          <Field
            label="מקום מפגש"
            value={place}
            onChangeText={setPlace}
            placeholder="לדוגמה: כניסה ראשית, קומה 2"
            autoFocus
            maxLength={200}
            returnKeyType="send"
            onSubmitEditing={() => place.trim() && send({ kind: 'place', place: place.trim() })}
          />
          <Button
            title="שליחת קריאה"
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
