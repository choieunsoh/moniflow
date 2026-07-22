import { expect, test } from 'vitest';
import { OVERDUE_DAYS, backupStatus } from './backup-safety';

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
