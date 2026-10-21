/** Место для быстрого вызова (п.6.1, п.7). */
export const CAR_PLACE = 'לאמבולנס';

/** Формирует текст вызова (п.7). Один и тот же текст уходит в push и в приложение. */
export function callText(kind: 'car' | 'place', place?: string | null): string {
  if (kind === 'car') return `🚨 קריאה\n🚑 ${CAR_PLACE}`;
  return `🚨 קריאה\n📍 ${place}`;
}
