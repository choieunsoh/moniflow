# Records Calendar Refund Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark days on the Records calendar where a refund landed, with a `+` glyph.

**Architecture:** `DayMarks` gains `refund`. `dayMarks` checks each row refund-first
(`amount > 0`), then off-budget, then posted, so one row still earns one mark. `CalendarGrid` draws
the `+` as a CSS shape and names it in the aria-label and legend. Darkness is unchanged.

**Tech Stack:** TypeScript strict, React 19, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-17-records-calendar-design.md` (section "Marks, per day").

## Global Constraints

- Branch `feat/records-calendar`. Never commit to `main`.
- Shell: **Git Bash / POSIX syntax** for every command. Never PowerShell.
- TS bans: no `any`, no `as` (except `as const`), no `!`, no ts-comments; `type` over `interface`.
- One ledger row earns at most ONE mark, checked in this order: refund (`amount > 0`), off-budget, posted.
- A refund does not change cell darkness (it already nets in `discretionaryByDate`).
- Mark order in a cell and legend: `posted, upcoming, offBudget, refund` (● ○ ◆ +).
- Words: aria `refund`, legend `Refund`.
- The `+` is a CSS shape in `currentColor` (no font glyph): a 6px box with two 2px bars on whole pixels.
- No colour, no new token, no schema/backup change.
- Do not create `.ts`/`.tsx` scratch files anywhere in the repo (ESLint lints the whole tree).
- Before committing: `npm run format:files <changed files>`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must pass.
- Commit: `type(scope): subject` + a why-body via repeated `-m`; one-word scope; no `Co-Authored-By` / `Claude-Session` trailers.
- The dev ledger at `127.0.0.1:4010` is REAL data: browser checks are read-only.

---

### Task 1: Refund mark in the data and the grid

**Files:**
- Modify: `src/features/entries/calendar-marks.ts:6-31`
- Modify: `src/features/entries/calendar-marks.test.ts:27-70`
- Modify: `src/features/entries/ui/CalendarGrid.tsx:41-64`
- Modify: `src/features/entries/ui/CalendarGrid.test.tsx`
- Modify: `src/features/entries/use-records-calendar.test.ts:76-90` (+ one new test)

**Interfaces:**
- Produces: `type DayMarks = { posted: boolean; upcoming: boolean; offBudget: boolean; refund: boolean }`;
  `DayMark({ kind })` accepts `kind: 'refund'`. `dayMarks(...)` signature unchanged.

The type change makes every `DayMarks` literal in tests incomplete (`toEqual` compares all keys, and
`Record<keyof DayMarks, string>` maps must list `refund`), which is why data and grid are one task.

- [ ] **Step 1: Update and extend the `dayMarks` tests**

In `src/features/entries/calendar-marks.test.ts`, replace the whole `describe('dayMarks', …)` block
(lines 27–70) with:

```ts
// Every mark key, false; tests spread in the ones they expect set so a new key can't be forgotten.
const NONE = { posted: false, upcoming: false, offBudget: false, refund: false };

describe('dayMarks', () => {
  it('marks a posted recurring bill', () => {
    const marks = dayMarks([entry('2026-07-02', -1000, { source: 'recurring' })], [], ...NO_SETS);
    expect(marks.get('2026-07-02')).toEqual({ ...NONE, posted: true });
  });

  it('marks off-budget spend, from the entry flag or the category default', () => {
    const marks = dayMarks(
      [
        entry('2026-07-03', -500, { offBudget: 1 }),
        entry('2026-07-04', -80, { category: 'Gifts' }),
      ],
      [],
      new Set(['Gifts']),
      new Set<string>(),
    );
    expect(marks.get('2026-07-03')).toEqual({ ...NONE, offBudget: true });
    expect(marks.get('2026-07-04')).toEqual({ ...NONE, offBudget: true });
  });

  it('gives a recurring row in an off-budget category the off-budget mark only', () => {
    // Same precedence as splitBudgetSpend: off-budget is checked first.
    const marks = dayMarks(
      [entry('2026-07-05', -300, { source: 'recurring', offBudget: 1 })],
      [],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-05')).toEqual({ ...NONE, offBudget: true });
  });

  it('marks upcoming bill dates and merges kinds on the same day', () => {
    const marks = dayMarks(
      [entry('2026-07-10', -40, { offBudget: 1 })],
      ['2026-07-10', '2026-07-12'],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-10')).toEqual({ ...NONE, upcoming: true, offBudget: true });
    expect(marks.get('2026-07-12')).toEqual({ ...NONE, upcoming: true });
  });

  it('leaves an ordinary spending day unmarked', () => {
    expect(dayMarks([entry('2026-07-01', -100)], [], ...NO_SETS).has('2026-07-01')).toBe(false);
  });

  it('marks a refund (a positive row)', () => {
    const marks = dayMarks([entry('2026-07-06', 405)], [], ...NO_SETS);
    expect(marks.get('2026-07-06')).toEqual({ ...NONE, refund: true });
  });

  it('gives an off-budget refund and a recurring refund the refund mark only', () => {
    // Refund is checked first: one row, one mark.
    const marks = dayMarks(
      [
        entry('2026-07-07', 200, { offBudget: 1 }),
        entry('2026-07-08', 99, { source: 'recurring' }),
      ],
      [],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-07')).toEqual({ ...NONE, refund: true });
    expect(marks.get('2026-07-08')).toEqual({ ...NONE, refund: true });
  });

  it("keeps a spend's mark beside a refund on the same day", () => {
    const marks = dayMarks(
      [entry('2026-07-09', -1000, { source: 'recurring' }), entry('2026-07-09', 50)],
      [],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-09')).toEqual({ ...NONE, posted: true, refund: true });
  });
});
```

- [ ] **Step 2: Run to verify the new refund tests fail**

Run: `npm test -- src/features/entries/calendar-marks.test.ts`
Expected: FAIL across the `dayMarks` block. The existing cases fail because the expected objects now
carry `refund: false` while the old result has no `refund` key (`toEqual` treats a missing key as
`undefined`, and `undefined !== false`). The three new refund tests fail on substance: no `refund`
key is ever set, an off-budget refund returns `offBudget: true`, a recurring refund returns
`posted: true`. Record the output.

- [ ] **Step 3: Implement the refund mark in `calendar-marks.ts`**

Replace lines 6–31 of `src/features/entries/calendar-marks.ts` with:

```ts
// Which kinds of money moved on a day, for the Records calendar's glyph marks. Colour is not used:
// hue already means category, the accent means action, and cell darkness means discretionary spend.
export type DayMarks = { posted: boolean; upcoming: boolean; offBudget: boolean; refund: boolean };

const NONE: DayMarks = { posted: false, upcoming: false, offBudget: false, refund: false };

// Marks per day, keyed 'YYYY-MM-DD'; a day with no mark is absent. Each row earns ONE mark, checked
// refund first (a positive amount is money handed back, whatever its category), then off-budget, then
// fixed: the same off-budget-before-fixed precedence as splitBudgetSpend. A refund leaves darkness
// alone: it already nets against the day in discretionaryByDate, so a refund-only day is otherwise
// indistinguishable from a quiet one. `upcomingDates` are the not-yet-posted rule dates the caller got
// from postsBetween — passed in as plain dates so this module never needs the recurring rule shape.
export function dayMarks(
  entries: EntryRow[],
  upcomingDates: readonly string[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, DayMarks> {
  const out = new Map<string, DayMarks>();
  const mark = (date: string, patch: Partial<DayMarks>) =>
    out.set(date, { ...(out.get(date) ?? NONE), ...patch });
  for (const e of entries) {
    if (e.amount > 0) mark(e.date, { refund: true });
    else if (isOffBudget(e, offBudgetCategories, travelCurrencies)) mark(e.date, { offBudget: true });
    else if (isFixed(e)) mark(e.date, { posted: true });
  }
  for (const date of upcomingDates) mark(date, { upcoming: true });
  return out;
}
```

- [ ] **Step 4: Run the marks tests to verify they pass**

Run: `npm test -- src/features/entries/calendar-marks.test.ts`
Expected: PASS, 11 tests (8 `dayMarks` + 3 `resolveSelectedDay`).

- [ ] **Step 5: Update the grid tests and add refund cases**

In `src/features/entries/ui/CalendarGrid.test.tsx`:

Replace the `marks` constant (lines 10–12) with:

```tsx
const NONE: DayMarks = { posted: false, upcoming: false, offBudget: false, refund: false };
const marks = new Map<string, DayMarks>([['2026-07-17', { ...NONE, posted: true, offBudget: true }]]);
```

In the test `'names only the marks on a zero-discretionary day that has them'`, replace
`{ posted: true, upcoming: false, offBudget: false }` with `{ ...NONE, posted: true }`.

Append inside the `describe`:

```tsx
  it('names a refund in the label and lists it in the legend only when present', () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={new Map([['2026-07-16', { ...NONE, refund: true }]])}
        hrefFor={(d) => d}
      />,
    );
    // A refund-only day nets to zero discretionary spend, so it names only its mark.
    expect(screen.getByRole('link', { name: 'Thu 16 Jul: refund' })).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
  });

  it('draws no Refund legend entry when no day has a refund', () => {
    render(<CalendarGrid cells={cells} marks={marks} hrefFor={(d) => d} />);
    expect(screen.queryByText('Refund')).toBeNull();
  });

  it("orders a busy day's marks posted, off-budget, refund in its label", () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={new Map([['2026-07-17', { ...NONE, posted: true, offBudget: true, refund: true }]])}
        hrefFor={(d) => d}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Fri 17 Jul: ฿240, bill posted, off-budget, refund' }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the grid tests to verify the refund ones fail**

Run: `npm test -- src/features/entries/ui/CalendarGrid.test.tsx`
Expected: the refund-label, refund-legend and ordering tests FAIL (the grid's `KINDS` has no
`refund`, so no word, no legend entry). Record the output.

- [ ] **Step 7: Draw and name the refund mark in `CalendarGrid.tsx`**

Replace lines 41–64 of `src/features/entries/ui/CalendarGrid.tsx` (from `const KINDS` through the end
of `DayMark`) with:

```tsx
const KINDS = ['posted', 'upcoming', 'offBudget', 'refund'] as const;
const WORDS: Record<keyof DayMarks, string> = {
  posted: 'bill posted',
  upcoming: 'bill due',
  offBudget: 'off-budget',
  refund: 'refund',
};
const LEGEND: Record<keyof DayMarks, string> = {
  posted: 'Bill posted',
  upcoming: 'Bill due',
  offBudget: 'Off-budget',
  refund: 'Refund',
};

// A 6px CSS shape in currentColor — filled dot, ring, diamond, plus — rather than a ●○◆+ text glyph,
// whose size and even presence vary by font fallback. Inherits the cell ink, so it carries the ramp's
// contrast guarantee for free. The plus is two 2px bars on whole pixels (6px box: bars at 2px–4px), so
// it stays crisp instead of smearing across half-pixels; it echoes how the ledger prints a refund, +฿.
export function DayMark({ kind }: { kind: keyof DayMarks }) {
  if (kind === 'refund') {
    return (
      <span aria-hidden="true" className="relative block size-1.5 shrink-0">
        <span className="absolute inset-x-0 top-[2px] block h-[2px] bg-current" />
        <span className="absolute inset-y-0 left-[2px] block w-[2px] bg-current" />
      </span>
    );
  }
  const shape =
    kind === 'posted'
      ? 'rounded-full bg-current'
      : kind === 'upcoming'
        ? 'rounded-full border border-current'
        : 'rotate-45 bg-current';
  return <span aria-hidden="true" className={`block size-1.5 shrink-0 ${shape}`} />;
}
```

Also update the grid's header comment line "glyph marks for bills and off-budget" (around line 67) to
"glyph marks for bills, off-budget spend and refunds".

- [ ] **Step 8: Run the grid tests to verify they pass**

Run: `npm test -- src/features/entries/ui/CalendarGrid.test.tsx`
Expected: PASS.

- [ ] **Step 9: Update the hook test literals and add a refund case**

In `src/features/entries/use-records-calendar.test.ts`, in the test
`'builds cells from discretionary spend and marks each kind of day'`, add `refund: false,` to each of
the three `toEqual({ posted, upcoming, offBudget })` objects (the `2026-07-02`, `2026-07-03` and
`2026-07-10` marks).

Add this test inside the `describe` (after that test):

```ts
  it('marks a refund day without darkening it', async () => {
    await addEntries(db, [{ date: '2026-07-04', account: 'Cash', category: 'Food', amount: 200 }]);
    const data = await load({ cycle: '2026-06', view: 'calendar' });
    const cal = data.calendar;
    if (cal === null) throw new Error('calendar view should build a calendar');
    expect(cal.marks.get('2026-07-04')).toEqual({
      posted: false,
      upcoming: false,
      offBudget: false,
      refund: true,
    });
    // A refund nets against the day, and a net-refund day clamps to 0.
    expect(cal.cells.find((c) => c.date === '2026-07-04')).toEqual({
      date: '2026-07-04',
      total: 0,
      intensity: 0,
    });
  });
```

(`db` is the `let db: Db` the file's `beforeEach` assigns; `addEntries` is already imported.)

- [ ] **Step 10: Run the hook tests**

Run: `npm test -- src/features/entries/use-records-calendar.test.ts`
Expected: PASS. To prove the new test can fail, temporarily change `e.amount > 0` in
`calendar-marks.ts` to `e.amount > 1000000`, run it, confirm the refund test FAILS, then restore and
confirm PASS. Record both outputs.

- [ ] **Step 11: Gates and commit**

```bash
npm run format:files src/features/entries/calendar-marks.ts src/features/entries/calendar-marks.test.ts src/features/entries/ui/CalendarGrid.tsx src/features/entries/ui/CalendarGrid.test.tsx src/features/entries/use-records-calendar.test.ts docs/superpowers/specs/2026-09-17-records-calendar-design.md
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/calendar-marks.ts src/features/entries/calendar-marks.test.ts src/features/entries/ui/CalendarGrid.tsx src/features/entries/ui/CalendarGrid.test.tsx src/features/entries/use-records-calendar.test.ts docs/superpowers/specs/2026-09-17-records-calendar-design.md
git commit -m "feat(features): mark refund days on the Records calendar" -m "A refund nets silently against its day, so a refund-only day looked like nothing happened. Positive rows now earn a plus mark, checked before off-budget and posted so each row still earns one mark, and the legend and day label name it."
```

---

### Task 2: Browser check (controller, read-only)

**Files:** none.

- [ ] **Step 1:** `npm run dev:web` in the background; wait for Ready on `http://127.0.0.1:4010`.
- [ ] **Step 2:** At 412×915 open `/records?cycle=2026-08&view=calendar&day=2026-09-03` (the real
  +฿405 refund day). Confirm: its link's aria-label contains `refund`; the legend lists `Refund`;
  the `+` is visible and distinguishable from ● ◆ in a screenshot; a day with several marks keeps
  them on one row inside the cell. Close any Google sign-in popup tab without signing in.
- [ ] **Step 3:** Set `document.documentElement.dataset.theme = 'light'` (no settings write) and
  screenshot the same cell. Then stop the dev server.
