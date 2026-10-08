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
      setError('Заполните имя, номер телефона и выберите роль');
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
      <Title>Оповещение команды</Title>
      <Muted>Номер телефона нужен для SMS, если вызов не подтверждён в приложении.</Muted>
      <Field label="Имя" value={name} onChangeText={setName} placeholder="Иван Иванов" autoComplete="name" />
      <Field
        label="Номер телефона"
        value={phone}
        onChangeText={setPhone}
        placeholder="+7 900 000-00-00"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Label>Роль</Label>
      <Segmented
        value={role}
        onChange={setRole}
        options={[
          { value: 'participant', label: 'Участник' },
          { value: 'dispatcher', label: 'Диспетчер' },
        ]}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Зарегистрироваться" onPress={submit} busy={busy} />
    </Screen>
  );
}
