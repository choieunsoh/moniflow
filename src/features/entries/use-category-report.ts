'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getFirstExpenseDate } from './queries';
import { buildBreakdownMatrix, type BreakdownWindow } from './breakdown-matrix';
import { cyclesInYear, currentCycleKey, firstTrackedYear, formatIsoRange } from './cycle';
import { monthLabel } from './trend';
import {
  foldCategoryReport,
  type CategoryReport,
  type ReportPeriod,
  type ReportView,
} from './category-report';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type CategoryReportData = CategoryReport & {
  view: ReportView;
  // The year actually shown — the requested one clamped into range, so a hand-typed ?year= cannot
  // strand the page on a window that could never hold data. Inert in the yearly view, but still
  // returned so the toggle can carry it back.
  year: number;
  // Bounds for the stepper. currentYear is the year of the CURRENT CYCLE, not of today: on 5 Jan the
  // live cycle is still last December's, so the newest reviewable year is that one.
  currentYear: number;
  firstYear: number | null;
  // The window's true span, e.g. '18 Jan – 26 Jul 2026'. Stated because a cutoff-based year does NOT
  // start on the 1st, and a page headed '2026' would quietly imply it does.
  rangeLabel: string;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// /report's data. The view decides the window AND the granularity together, which is what keeps the
// picker list and the chart describing the same span: monthly is one cycle-aligned year bucketed per
// cycle, yearly is every tracked year bucketed per year. Re-runs on ?view=/?year=/?category= change
// or after any write (useDataVersion).
export function useCategoryReport(
  view: ReportView,
  year: number | null,
  category: string | null,
): { ready: boolean; data: CategoryReportData | null } {
  const [data, setData] = useState<CategoryReportData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  // Drop ready DURING RENDER when the window changes — React's "adjusting state when a prop changes",
  // the same pattern and the same reason as useHome. The effect's own setReady(false) sits inside the
  // withDb callback, so it lands a microtask late and the page commits one frame of the PREVIOUS
  // window's figures under the new ?view=/?year=/?category=. That frame is not cosmetic here: this
  // page's list navigates to ITSELF (a year row opens that year's months), so the component never
  // unmounts, `data` outlives the params that produced it, and on a real OPFS read the stale frame
  // lasts the whole round trip — a second drill-down looks like it reopened the first row you tapped.
  // Deliberately keyed on the REQUESTED params, not the clamped year: they are what the URL changed.
  const windowKey = `${view}|${year}|${category}`;
  const [shownKey, setShownKey] = useState(windowKey);
  if (shownKey !== windowKey) {
    setShownKey(windowKey);
    setReady(false);
  }

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
      const currentYear = Number(currentKey.split('-')[0]);
      const firstYear = firstTrackedYear(firstDate, cutoff);
      const activeYear = clamp(year ?? currentYear, firstYear ?? currentYear, currentYear);

      const { windows, periods } =
        view === 'yearly'
          ? yearlyWindow(firstYear, currentYear, currentKey, cutoff)
          : monthlyWindow(activeYear, currentKey, cutoff);

      const matrix = await buildBreakdownMatrix(db, windows);

      setData({
        ...foldCategoryReport(matrix, periods, category),
        view,
        year: activeYear,
        currentYear,
        firstYear,
        rangeLabel: toRangeLabel(windows, today),
        emojiMap,
        hueMap,
        iconSet,
      });
      setReady(true);
    });
  }, [view, year, category, version]);

  return { ready, data };
}

// NOT named `Window` — that shadows the DOM global and reads as the browser type at every use site.
type WindowSpec = { windows: BreakdownWindow[]; periods: ReportPeriod[] };

// One year, bucketed per cycle. cyclesInYear clips at the live cycle, so the current year is
// year-to-date rather than twelve bars with five empty ones on the end.
function monthlyWindow(year: number, currentKey: string, cutoff: number): WindowSpec {
  const cycles = cyclesInYear(year, currentKey, cutoff);
  return {
    windows: cycles,
    periods: cycles.map((c) => ({
      key: c.key,
      label: monthLabel(c.key),
      partial: c.key === currentKey,
    })),
  };
}

// Every tracked year, bucketed per year. A year's cycles are contiguous, so its whole span is ONE
// bounded range — N aggregates for N years, not twelve each. The bars are built as plain periods
// keyed by the year itself; TrendBar is not tied to a Cycle, so no synthetic cycles are needed.
function yearlyWindow(
  firstYear: number | null,
  currentYear: number,
  currentKey: string,
  cutoff: number,
): WindowSpec {
  if (firstYear === null) return { windows: [], periods: [] };
  const windows: BreakdownWindow[] = [];
  const periods: ReportPeriod[] = [];
  for (let y = firstYear; y <= currentYear; y++) {
    const cycles = cyclesInYear(y, currentKey, cutoff);
    if (cycles.length === 0) continue;
    const key = String(y);
    windows.push({ key, start: cycles[0].start, end: cycles[cycles.length - 1].end });
    periods.push({ key, label: key, partial: y === currentYear });
  }
  return { windows, periods };
}

// A window in progress is bounded by TODAY, not by its last cycle's end — that end is in the future,
// and labelling the span '18 Jan – 17 Aug' claims spend that cannot exist yet.
function toRangeLabel(windows: BreakdownWindow[], today: string): string {
  if (windows.length === 0) return '';
  const last = windows[windows.length - 1];
  return formatIsoRange(windows[0].start, last.end < today ? last.end : today);
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : max;
}
