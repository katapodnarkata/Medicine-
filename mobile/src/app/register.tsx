import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Label, Muted, Screen, Segmented, Title } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

export default function Register() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !role) {
      setError('יש למלא שם, מספר טלפון ולבחור תפקיד');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.register({ name: name.trim(), phone: phone.trim(), role });
      await signIn(res.token, res.user);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>התראה לצוות</Title>
      <Muted>הירשמו כדי לקבל ולשלוח קריאות לצוות.</Muted>
      <Field label="שם" value={name} onChangeText={setName} placeholder="ישראל ישראלי" autoComplete="name" />
      <Field
        label="מספר טלפון"
        value={phone}
        onChangeText={setPhone}
        placeholder="050-123-4567"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Label>תפקיד</Label>
      <Segmented
        value={role}
        onChange={setRole}
        options={[
          { value: 'participant', label: 'חבר צוות' },
          { value: 'dispatcher', label: 'מוקדן' },
        ]}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="הרשמה" onPress={submit} busy={busy} />
    </Screen>
  );
}
