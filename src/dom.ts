// Tiny DOM helpers — no framework.

/** Query a required element by id; throws if missing (fail fast during dev). */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/** Set textContent only when it changed (avoids needless layout work). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Toggle a class based on a boolean. */
export function toggleClass(el: HTMLElement, cls: string, on: boolean): void {
  el.classList.toggle(cls, on);
}
