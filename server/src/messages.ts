/** Место для быстрого вызова (п.6.1, п.7). */
export const CAR_PLACE = 'К машине';

/** Формирует текст вызова (п.7). Один и тот же текст уходит в push, в приложение и в SMS. */
export function callText(kind: 'car' | 'place', place?: string | null): string {
  if (kind === 'car') return `🚨 ВЫЗОВ\n🚑 ${CAR_PLACE}`;
  return `🚨 ВЫЗОВ\n📍 ${place}`;
}
