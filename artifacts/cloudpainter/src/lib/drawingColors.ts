export const COLOR_GROUPS = [
  { name: 'Neutrals', colors: [
    { name: 'Black', hex: '#000000' },
    { name: 'Charcoal', hex: '#374151' },
    { name: 'Gray', hex: '#808080' },
    { name: 'Silver', hex: '#cbd5e1' },
    { name: 'White', hex: '#ffffff' },
    { name: 'Cream', hex: '#fff4d6' },
    { name: 'Sand', hex: '#e6c9a9' },
    { name: 'Brown', hex: '#855c3b' },
  ] },
  { name: 'Warm', colors: [
    { name: 'Red', hex: '#dc2626' },
    { name: 'Coral', hex: '#ee806b' },
    { name: 'Orange', hex: '#ea580c' },
    { name: 'Gold', hex: '#e3ad3b' },
    { name: 'Yellow', hex: '#facc15' },
    { name: 'Pink', hex: '#ec4899' },
    { name: 'Rose', hex: '#f9a8d4' },
    { name: 'Burgundy', hex: '#881337' },
  ] },
  { name: 'Cool', colors: [
    { name: 'Forest', hex: '#315d4d' },
    { name: 'Green', hex: '#16a34a' },
    { name: 'Mint', hex: '#86efac' },
    { name: 'Teal', hex: '#0d9488' },
    { name: 'Sky', hex: '#38bdf8' },
    { name: 'Slate blue', hex: '#6d86a3' },
    { name: 'Blue', hex: '#2563eb' },
    { name: 'Lavender', hex: '#8b72a6' },
  ] },
];

/** Accept opaque RGB hex only; expand shorthand to the native picker's format. */
export function normalizeHexColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  return `#${(hex.length === 3 ? [...hex].map(char => char + char).join('') : hex).toLowerCase()}`;
}
