import { createContext, useContext } from 'react';

/** Текст проблемы с push-уведомлениями (null — всё в порядке). */
export const PushStatusContext = createContext<string | null>(null);
export const usePushProblem = () => useContext(PushStatusContext);
