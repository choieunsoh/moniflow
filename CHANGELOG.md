# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
