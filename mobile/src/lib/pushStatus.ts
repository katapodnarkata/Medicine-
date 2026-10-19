import { createContext, useContext } from 'react';

export interface PushStatus {
  /** Текст проблемы с уведомлениями (null — всё в порядке). */
  problem: string | null;
  /** Если задано — кнопка «Включить уведомления» (в браузере разрешение спрашивается по нажатию). */
  enable?: () => void;
}

export const PushStatusContext = createContext<PushStatus>({ problem: null });
export const usePushStatus = () => useContext(PushStatusContext);
