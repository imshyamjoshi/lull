// Inline SVG icons (Tabler-style, thin stroke). Bundled locally — no icon font,
// no remote fonts, no CDN (AI_RULES.md: everything local). Currentcolor picks up
// the button's text color.

const svg = (paths: string): string =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ` +
  `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  play: svg(`<path d="M7 5v14l11 -7z" />`),
  pause: svg(`<path d="M8 5v14" /><path d="M16 5v14" />`),
  refresh: svg(
    `<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />` +
      `<path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />`,
  ),
  settings: svg(
    `<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />` +
      `<path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />`,
  ),
  eye: svg(
    `<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />` +
      `<path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />`,
  ),
  chevronUp: svg(`<path d="M6 15l6 -6l6 6" />`),
  chevronDown: svg(`<path d="M6 9l6 6l6 -6" />`),
} as const;
