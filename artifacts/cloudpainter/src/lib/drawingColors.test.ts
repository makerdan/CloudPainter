import assert from 'node:assert/strict';
import test from 'node:test';
import { COLOR_GROUPS, normalizeHexColor } from './drawingColors.ts';

test('normalizes full and shorthand hex, optional hash, whitespace and case', () => {
  for (const [input, expected] of [
    ['#a1B2c3', '#a1b2c3'], ['A1B2C3', '#a1b2c3'],
    [' #AbC ', '#aabbcc'], ['abc', '#aabbcc'],
    ['#000', '#000000'], ['#FFF', '#ffffff'],
  ]) assert.equal(normalizeHexColor(input), expected);
});

test('rejects invalid, partial, alpha, named and functional colors', () => {
  for (const input of ['', ' ', '#', '#12', '#1234', '#12345', '#1234567',
    '#12345678', '##123456', '#ggg', 'red', 'rgb(1,2,3)', '#ab cd e', '<script>']) {
    assert.equal(normalizeHexColor(input), null, input);
  }
});

test('presets have unique names and canonical opaque colors, with essential neutrals', () => {
  const colors = COLOR_GROUPS.flatMap(group => group.colors);
  assert.ok(colors.length >= 18);
  assert.equal(new Set(colors.map(color => color.hex)).size, colors.length);
  assert.equal(new Set(colors.map(color => color.name)).size, colors.length);
  for (const { hex } of colors) assert.equal(normalizeHexColor(hex), hex);
  for (const hex of ['#000000', '#ffffff', '#808080', '#315d4d']) {
    assert.ok(colors.some(color => color.hex === hex));
  }
});
