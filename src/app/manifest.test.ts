import { describe, it, expect } from 'vitest';
import manifest from './manifest';

// The whole app exists to catch a purchase in the three seconds you have at a counter, but an
// installed launcher only ever offered "open the app" — Home, then the tab bar, then the keypad. A
// manifest shortcut is the platform's own answer: long-press the icon, land on the keypad.
describe('manifest shortcuts', () => {
  it('offers a New entry shortcut straight to the keypad', () => {
    const shortcut = manifest().shortcuts?.find((s) => s.url === '/entries/new');
    expect(shortcut?.name).toBe('New entry');
  });

  it('keeps every shortcut inside the manifest scope', () => {
    const { scope, shortcuts } = manifest();
    expect(shortcuts?.length).toBeGreaterThan(0);
    for (const s of shortcuts ?? []) expect(s.url.startsWith(scope ?? '/')).toBe(true);
  });
});
