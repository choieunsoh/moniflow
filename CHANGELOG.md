# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
