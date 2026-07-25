'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntriesInRange } from './queries';
import { lastCycles, currentCycleKey } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import { yearSummary, type YearSummary } from './year';

// Twelve cycles = "the last year". Tunable in one place. Deliberately not shared with TREND_CYCLES
// (6): the trend answers "is this normal", the recap answers "where did the year go".
export const YEAR_CYCLES = 12;

export type YearData = YearSummary & {
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// The /year recap's data, read after mount from the browser OPFS db. Re-runs on ?cycle= change or
// after any write (useDataVersion). One getEntriesInRange over the whole window — the cycles are
// contiguous, so [cycles[0].start, last.end] covers every entry the fold needs.
export function useYear(cycleKey: string | null): { ready: boolean; data: YearData | null } {
  const [data, setData] = useState<YearData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleKey ?? currentKey;
      const cycles = lastCycles(activeKey, YEAR_CYCLES, cutoff);
      const entries = await getEntriesInRange(db, cycles[0].start, cycles[cycles.length - 1].end);

      setData({ ...yearSummary(entries, cycles, currentKey), emojiMap, hueMap, iconSet });
      setReady(true);
    });
  }, [cycleKey, version]);

  return { ready, data };
}
