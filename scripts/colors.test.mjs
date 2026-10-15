import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const [query, cached, systemDark, expected] of [
  ['?theme=system&systemTheme=dark', 'light', false, 'dark'],
  ['?theme=system&systemTheme=light', 'dark', true, 'light'],
  ['?theme=light&systemTheme=dark', null, true, 'light'],
  ['?theme=light', 'dark', true, 'light'],
  ['?theme=dark', 'light', false, 'dark'],
  ['?theme=system', 'dark', false, 'light'],
  ['?theme=system', 'light', true, 'dark'],
  ['', 'dark', false, 'dark'],
  ['', null, true, 'dark'],
  ['?theme=invalid', null, false, 'light'],
]) {
  test(`startup ${query} cached=${cached} systemDark=${systemDark}`, () => {
    const document = { querySelector: () => null, documentElement: { dataset: {} } };
    runInNewContext(script, { URLSearchParams, location: { search: query }, document,
      localStorage: { getItem: () => cached }, matchMedia: () => ({ matches: systemDark }) });
    assert.equal(document.documentElement.dataset.theme, expected);
  });
}
test('startup works when storage is unavailable', () => {
  const document = { querySelector: () => null, documentElement: { dataset: {} } };
  runInNewContext(script, { URLSearchParams, location: { search: '' }, document,
    localStorage: { getItem: () => { throw Error('blocked'); } }, matchMedia: () => ({ matches: true }) });
  assert.equal(document.documentElement.dataset.theme, 'dark');
});
