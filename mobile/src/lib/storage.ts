import * as SecureStore from 'expo-secure-store';

/** Хранилище токена и профиля: на телефоне — защищённое хранилище системы. */
export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
