import { expect, test } from 'vitest';
import { OVERDUE_DAYS, backupStatus, backupSummary } from './backup-safety';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

test('never backed up is overdue only when there is data to lose', () => {
  expect(backupStatus(null, NOW, 0)).toEqual({ overdue: false, daysSince: null });
  expect(backupStatus(null, NOW, 5)).toEqual({ overdue: true, daysSince: null });
});

test('fresh backup is not overdue; overdue only strictly past the threshold', () => {
  expect(backupStatus(NOW, NOW, 5)).toEqual({ overdue: false, daysSince: 0 });
  expect(backupStatus(NOW - OVERDUE_DAYS * DAY, NOW, 5)).toEqual({
    overdue: false,
    daysSince: OVERDUE_DAYS,
  });
  expect(backupStatus(NOW - (OVERDUE_DAYS + 1) * DAY, NOW, 5)).toEqual({
    overdue: true,
    daysSince: OVERDUE_DAYS + 1,
  });
});

test('backwards clock floors at zero and is not overdue', () => {
  expect(backupStatus(NOW + DAY, NOW, 5)).toEqual({ overdue: false, daysSince: 0 });
});

test('no data is never overdue even with an ancient backup', () => {
  expect(backupStatus(NOW - 365 * DAY, NOW, 0)).toEqual({ overdue: false, daysSince: 365 });
});

// The About screen states the backup age in words. Kept pure and separate from the overdue DECISION
// above because the two answer different questions — "should we nudge" versus "what do we say" — and
// only the wording needs to read naturally at 0 and 1 day.
test('backup summary reads naturally at every age', () => {
  expect(backupSummary({ overdue: false, daysSince: null })).toBe('Never backed up');
  expect(backupSummary({ overdue: false, daysSince: 0 })).toBe('Backed up today');
  expect(backupSummary({ overdue: false, daysSince: 1 })).toBe('Backed up yesterday');
  expect(backupSummary({ overdue: false, daysSince: 3 })).toBe('Backed up 3 days ago');
  expect(backupSummary({ overdue: true, daysSince: 42 })).toBe('Backed up 42 days ago');
});
