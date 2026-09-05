# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.16.1] - 2026-09-05

### Fixed

- merge the layout-and-polish slice
- stop the keypad's account chip truncating to two letters
- give every checkbox the app's own accent and a legible size
- withhold the expense FAB inside the entry flow
- give the chart's reference labels a ground of their own
- stop a /records row painting its chips over its own amount

## [1.16.0] - 2026-09-05

### Added

- merge the density slice — fold long ranked tails instead of truncating them
- fold the analytics ranked tail behind one tap

### Fixed

- trim the accounts row padding, the only lever that list has
- fold the accounts legend where its own ring folds

### Other

- lift the ranked-tail disclosure out of Breakdown

## [1.15.2] - 2026-09-05

### Fixed

- merge the /records refund-sign fix with its render test and the doc truing round
- stop /records printing a refund's own total with the opposite sign

### Other

- render /records and pin the refund sign the source scan cannot see
- fail the suite when a doc contradicts the ledger convention
- stop the README saying amounts are integer satang
- true PRODUCT.md up to refunds, the real More sheet, and the OS theme default
- pin Node 24 in .nvmrc and package.json engines
- cover useEditRule, the one hook the repo left untested
- true CLAUDE.md up to withDb, the OPFS tab lock, and the real dependency rule
- correct the CLAUDE.md rule the refund-sign fix inverted
- retire the ghost accent hex and pin what replaced it
- true DESIGN.md up to the two theme axes
- true CLAUDE.md up to the current codebase

## [1.15.1] - 2026-09-05

### Fixed

- make the accent swatches tell their palettes apart
- make the accent swatches tell their palettes apart

## [1.15.0] - 2026-09-04

### Added

- merge the theme axes slice
- put the appearance controls in Settings
- add the theme and accent pickers
- stamp the saved appearance before first paint
- apply the stored appearance from a single reconciler hook
- persist the theme and accent choices
- add nine accent palettes as fixed-lightness tints
- declare every colour as a light-dark pair
- add the pure value module for both theme axes

### Fixed

- rebuild the charts when the resolved theme changes
- keep the pickers correct across the remount every pick causes
- stop the pickers promising a keyboard contract they do not keep

### Other

- pin the inline script's lists and cover the ThemePicker remount
- correct two overstated claims in the accent palette comment
- give the strong border a ceiling so a transposed pair fails
- read token contrast per theme
- correct three plan claims found by a pre-flight codebase check
- plan the theme-axes implementation in nine tasks
- spec two theme axes — light mode and a picked accent

## [1.14.0] - 2026-09-03

### Added

- merge the ledger-ink palette slice
- reserve red for over budget and errors
- give every accent reference one meaning
- move the shared component classes onto the action token
- derive the palette and pin it with a contrast test

### Fixed

- restore a visible border on selected schedule and chip states

### Other

- fix stale accent-era comments after the selected-state palette move
- implementation plan for the ledger-ink slice
- design for the ledger-ink palette slice

## [1.13.0] - 2026-09-03

### Added

- name the money the donut could not draw

### Fixed

- merge the truth-and-trust review slice
- name refunded categories on the cycle totals card
- pluralise entry count on accounts and categories
- stop refunded amount and category list from disagreeing
- relabel the discretionary budget block Spent from budget
- render the blank-note bucket as a residual
- say what the count columns count
- give the accounts list its own heading
- say refunded instead of negative spent on budgets
- split the Home headline into gross and budget blocks
- stop naming net-zero accounts as refunded on /accounts
- divide donut shares by what the ring drew

### Other

- drop Task 2, its premise was false
- retarget the plan's tests at units that exist
- implementation plan for the truth-and-trust slice
- design for the truth-and-trust fix slice

## [1.12.5] - 2026-09-02

### Fixed

- one entry editor — edit a refund on the keypad
- edit a refund on the keypad, not a separate form

### Other

- pair the keypad's two toggles on one row

## [1.12.4] - 2026-08-21

### Added

- show tomorrow's safe-to-spend on the Home card
- show tomorrow's safe-to-spend on the Home card

## [1.12.3] - 2026-08-21

### Fixed

- render September as the three-letter Sep, not Sept
- render September as the three-letter Sep, not Sept

## [1.12.2] - 2026-08-18

### Fixed

- spawn the deploy through runNpm so it does not die with ENOENT on Windows

## [1.12.1] - 2026-08-18

### Added

- deploy to Vercel production at the end of every release

### Fixed

- reserve a foreign recurring bill in baht, not at its face amount

## [1.12.0] - 2026-08-18

### Added

- take fixed costs out of the budget instead of counting them as spend
- take fixed costs out of the budget instead of counting them as spend

### Fixed

- show the typed limit in the Budgets field, not the reduced ceiling

## [1.11.0] - 2026-08-15

### Added

- record refunds against the category they refund
- let the keypad record a refund
- let refunds through the cycle and search reads
- net inflows in the row-level rollups
- net inflows in the category aggregates
- net inflows in the budget split

### Fixed

- show a refund-only category's spend figure on /budgets
- agree Home's total and Records' by-spend ranking with the netted rollups
- stop a refund from rendering as a purchase in top-transaction lists
- clamp the budget meter to 0% and stop dropping refund-only rows
- stop backup restore from eating refunds
- clamp and drop net-positive rows from spending lists
- mark a refund-positive total in Records with its sign
- net the account breakdown and cover the category read

### Other

- fix stale spend-magnitude comments and a purchase-only label
- extract the sign-only-on-refund ternary into formatLedgerSpend
- prove the net-vs-magnitude sort and total fixes can fail
- fix Keypad.test.tsx's stale comment and shadowed EntryRow type
- correct two stale comments the refund model outdated
- replace use-year's unsupported Salary fixture with a real refund
- describe the refund model in the project overview
- restore the zero-amount ceiling note in parseMonefyCsv
- add refund toggle initialization tests
- remove unreachable Math.max clamps from Breakdown and accounts list
- cover Breakdown's net-positive category handling
- sort aggregates by net spend, not magnitude
- pin the netting arithmetic in year and heatmap rollups
- plan the income-entries implementation
- spec income entries as negative spend

## [1.10.3] - 2026-08-06

### Fixed

- lead the allowance card with what's left, not the allowance
- lead the allowance card with what's left, not the allowance

## [1.10.2] - 2026-08-06

### Added

- add a Today's allowance KPI that holds still all day
- add a Today's allowance KPI that holds still all day

## [1.10.1] - 2026-07-30

### Fixed

- make every keypad follow the Settings layout
- make the recurring-rule keypad follow the Settings layout

## [1.10.0] - 2026-07-28

### Added

- reach a category's whole history from /report
- paginate the all-time category records at 100 a page
- link a category report to all its records

## [1.9.1] - 2026-07-28

### Fixed

- give 📦 a line icon in both icon sets
- give 📦 a line icon in both icon sets

## [1.9.0] - 2026-07-28

### Added

- move the currency list into a database table
- add the currency page
- carry the currency catalog through backup v4
- validate currencies against the catalog, not a const
- treat travel-currency spend as off-budget
- seed and query the currency catalog
- add the currencies table

### Fixed

- stop /currency blanking the whole list on every write
- reflect the travel-currency tier in the off-budget checkbox
- close the remaining archived-currency data-loss gaps
- stop THB being hideable or off-budgetable on /currency
- test the currency-restore wiring and stop backups mutating the DB
- stop archived currencies from corrupting existing entries

### Other

- stop the app-routes list from going stale again
- strengthen the rate-plumbing assertion and mirror the negative case
- document the currencies feature
- pin the trips list to explicit currencyDisplay 'symbol'
- plan the currency catalog feature

## [1.8.1] - 2026-07-27

### Fixed

- carry off_budget through backup export and restore

### Other

- merge feat/backup-off-budget (carry off_budget through backup export/restore)

## [1.8.0] - 2026-07-27

### Added

- add About — version and data health in one glance
- add About — version and data health in one glance

## [1.7.7] - 2026-07-27

### Fixed

- generate the stamped service worker before next build, not after
- generate the stamped service worker before next build, not after

## [1.7.6] - 2026-07-27

### Fixed

- make an installed PWA pick up new releases
- make an installed PWA pick up new releases

## [1.7.5] - 2026-07-27

### Other

- remove the temporary cycle diagnostic from Records
- remove the temporary cycle diagnostic from Records

## [1.7.4] - 2026-07-27

### Fixed

- stop SwipeNav destroying the click on a tapped row
- stop SwipeNav destroying the click on a tapped row

## [1.7.3] - 2026-07-27

### Other

- add a temporary cycle diagnostic to Records
- add a temporary cycle diagnostic to Records

## [1.7.2] - 2026-07-27

### Fixed

- stop SwipeNav swallowing thumb taps on its rows
- stop SwipeNav swallowing thumb taps on its rows

## [1.7.1] - 2026-07-27

### Fixed

- align zero-spend rows and stop /report showing the previous window
- stop /report showing the previous window under new params
- align zero-spend period rows with the linked ones

## [1.7.0] - 2026-07-26

### Added

- add /report — pick a category, see it over time
- add /report — one category, seen over time
- read a category's spend over a year or over all years
- fold a breakdown matrix into a category report

### Fixed

- tighten category-report review-pass loose ends

### Other

- plan the /report category report
- spec the /report category report

## [1.6.0] - 2026-07-26

### Added

- starter set and inline new-category, ending the first-run dead end
- starter set and inline new-category, ending the first-run dead end

## [1.5.1] - 2026-07-26

### Added

- group the More sheet by topic in a 3-column grid
- group the More sheet by topic in a 3-column grid

## [1.5.0] - 2026-07-26

### Added

- swipe from anywhere, including tappable rows
- swipe from anywhere, including tappable rows
- year/month navigation polish — sticky stepper, swipe, chart gutter
- swipe to change year and month
- /month — one calendar month across every year
- /month — one calendar month across every year
- calendar-year window on /year, stepped with ?year=
- calendar-year window on /year, stepped with ?year=

### Fixed

- reclaim the ~50px gutter a hidden y-axis was holding
- make the year stepper sticky, like the cycle and month ones

### Other

- lift RowChevron into shared/ui/Chevron
- lift the stepper chevrons into shared/ui

## [1.4.0] - 2026-07-25

### Added

- year-in-review page + More sheet entry
- useYear -- read hook for the year recap
- yearSummary — trailing-12-cycle recap fold

### Other

- year-qualified purchase date + accurate Top-notes label on /year
- implementation plan for year-in-review
- spec year-in-review surface (Spec B)

## [1.3.0] - 2026-07-25

### Added

- day-of-week spending card on Trends
- byWeekday — day-of-week spending aggregation
- scope biggest-tx and note rollup to the filtered category
- per-category vs-last-cycle delta in the filtered trend view
- show what changed — top movers on the cycle-delta card
- deltaByCategory — rank what drove the cycle-over-cycle change

### Other

- tidy delta-breakdown guard and stale scoping comment
- implementation plan for spending-insights drill-down
- spec spending-insights drill-down (Spec A)

## [1.2.0] - 2026-07-25

### Added

- off-budget spend — exclude irregular one-offs from the budget
- add a per-category off-budget toggle
- add the exclude-from-budget toggle to the expense keypad
- add an exclude-from-budget toggle to the entry form
- budgets page meters use discretionary spend
- show discretionary spend + off-budget disclosure on Home, drop Projected
- compute Home budget math on discretionary spend
- add off-budget spend split (pure)
- add category off-budget query + setter
- add off_budget columns to categories and entries
- reporting phases 2 & 3 — top transactions + spending by account
- add a By category / By account toggle to Trends
- group the Trends window by account when by=account
- add a sort-by-amount mode to Records
- show top transactions on Home
- load the active cycle's top transactions in useHome
- add topTransactions pure fn
- reporting IA redesign — merge Home+Dashboard, promote Trends
- show forward figures on an empty current cycle
- promote Analytics to the Trends bottom tab, retire Dashboard
- move the this-vs-last card onto Trends
- merge the dashboard into Home and delete the /dashboard route
- fold current-cycle forward figures into useHome

### Fixed

- show upcoming foreign bills in their own currency
- migrate existing OPFS dbs to add off_budget columns
- hide the group-by tabs in Records sort-by-amount mode
- keep Trends anomalies category-based under by=account

### Other

- reorder the More sheet grid
- drop stale 'projected total' from Home, note off-budget spend
- add off-budget spend implementation plan
- add off-budget spend design spec
- add Phase 2 & 3 reporting plan (top transactions, by-account)
- update README/PRODUCT nav for the reporting redesign
- add reporting IA redesign Phase 1 plan; correct spec
- add reporting IA redesign spec

## [1.1.0] - 2026-07-24

### Added

- trace loading skeletons for dashboard and analytics
- surface analytics amounts in ink and mark rows as tappable
- lead the dashboard with safe-to-spend as its hero figure
- merge the insight round — upcoming bills, top notes, spend heatmap, anomaly flag
- lay the spend heatmap out as a real month calendar
- top-notes list on analytics — spend ranked by note text
- spend heatmap on analytics — a daily-intensity grid for the cycle
- anomaly banner on analytics — categories above their own norm
- expose top-notes, heatmap cells, and anomalies from use-analytics
- flag categories spending above their own norm (anomalies)
- per-day spend intensity cells for a cycle (toHeatmapCells)
- rank spend by note text (topNotes)
- show upcoming bills on the dashboard and reserve them from safe-to-spend
- safe-to-spend reserves committed recurring bills
- total a cycle's upcoming bills (committedThisCycle)
- add postsBetween — a rule's not-yet-posted future in a window

### Other

- fold the dashboard upcoming-bills line into one component
- lock anomaly zeros-exclusion, ranking, and threshold boundary
- lock heatmap month-crossing and ceil bucketing
- lock postsBetween's inclusive upper boundary
- implementation plan for the insight round
- spec insight round (upcoming bills, top notes, heatmap, anomaly)

## [1.0.1] - 2026-07-24

### Other

- merge one-command release automation
- apply prettier formatting
- add one-command release automation
- add home screen screenshot to README
