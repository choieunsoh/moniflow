# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
