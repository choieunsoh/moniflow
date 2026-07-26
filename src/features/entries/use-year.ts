'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntriesInRange, getFirstExpenseDate } from './queries';
import { cyclesInYear, currentCycleKey, firstTrackedYear, formatIsoRange } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import { yearSummary, type YearSummary } from './year';

export type YearData = YearSummary & {
  // The year actually shown — the requested one clamped into range, so a hand-typed ?year= can't
  // strand the page on a window that cannot hold data.
  year: number;
  // Bounds for the stepper. currentYear is the year of the CURRENT CYCLE, not of today: on 5 Jan
  // the live cycle is still last December's, so the latest year you can review is that one — which
  // also means the year recap becomes reviewable exactly when its final cycle closes.
  currentYear: number;
  firstYear: number | null;
  // The window's true span, e.g. '18 Jan – 26 Jul 2026'. Stated because a cutoff-based year does
  // NOT start on the 1st, and a page headed '2026' would otherwise quietly imply it does.
  rangeLabel: string;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// The /year recap's data, read after mount from the browser OPFS db. Re-runs on ?year= change or
// after any write (useDataVersion). One getEntriesInRange over the whole window — the cycles are
// contiguous, so [cycles[0].start, last.end] covers every entry the fold needs.
export function useYear(year: number | null): { ready: boolean; data: YearData | null } {
  const [data, setData] = useState<YearData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, firstDate, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getFirstExpenseDate(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const today = todayIso();
      const currentKey = currentCycleKey(today, cutoff);
      const currentYear = yearOfKey(currentKey);
      const firstYear = firstTrackedYear(firstDate, cutoff);
      const activeYear = clamp(year ?? currentYear, firstYear ?? currentYear, currentYear);

      const cycles = cyclesInYear(activeYear, currentKey, cutoff);
      const last = cycles[cycles.length - 1];
      const entries = await getEntriesInRange(db, cycles[0].start, last.end);
      // A year in progress is bounded by today, not by the live cycle's end date — that end is in
      // the future, and labelling the window '18 Jan – 17 Aug' claims spend that cannot exist yet.
      const rangeLabel = formatIsoRange(cycles[0].start, last.end < today ? last.end : today);

      setData({
        ...yearSummary(entries, cycles, currentKey),
        year: activeYear,
        currentYear,
        firstYear,
        rangeLabel,
        emojiMap,
        hueMap,
        iconSet,
      });
      setReady(true);
    });
  }, [year, version]);

  return { ready, data };
}

function yearOfKey(key: string): number {
  return Number(key.split('-')[0]);
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : max;
}
