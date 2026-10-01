import type { PointerEvent } from 'react';

/** Position the quiet edge light near the pointer without React render work. */
export function moveSpecularEdge(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--specular-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--specular-y', `${event.clientY - rect.top}px`);
}
