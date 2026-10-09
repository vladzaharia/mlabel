# Documentation content review

This review covers every original authored page, all generated reference pages, and the new role and recipe pages. It is an editorial maintenance record, not part of the published navigation.

## Organizing decisions

- Keep one entry path per role; expose visual controls and recipes directly to administrators.
- Show the result before configuration; give every cookbook recipe runnable files and its own screenshots.
- Separate introductions, operational steps, troubleshooting, and exhaustive reference.
- Keep existing page routes. Move detailed conditions and source parsing into focused pages with links from their old locations.
- Keep schema tables generated; add location and practical-example guidance in the generator.
- Use screenshot crops for individual controls and cards; keep full windows for orientation. All screenshot pairs can open at full size.

## Original authored pages

| Page                     | Decision and change                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `admin/deploying`        | Rewrote delivery, configuration discovery, update policy, file locations, and the return checklist.                  |
| `admin/distributing`     | Separated assignment tracking and acceptance from the split/join button instructions.                                |
| `admin/planning`         | Rewrote form design and pilot advice; added visual notes/help examples and schema-change guidance.                   |
| `config/adapters`        | Retained format reference, clarified adapter-owned settings, linked a runnable semicolon example.                    |
| `config/agents`          | Removed the oversized all-features config; linked runnable examples and corrected editor-validation claims.          |
| `config/cards`           | Rewrote around an actual two-card layout, metadata grouping, and setup-screen examples.                              |
| `config/cookbook`        | Split ten fragments into an illustrated index and ten runnable walkthroughs, keeping the index route.                |
| `config/display`         | Rewrote around actual captions, instructions, help popovers, and selected-choice styling.                            |
| `config/errors`          | Kept message lookup; added a recipient/author entry path and corrected misleading explanations.                      |
| `config/fields`          | Rewrote the source/question/export distinction with screenshots and practical naming guidance.                       |
| `config/fill`            | Rewrote the four value sources with per-record and setup-screen screenshots.                                         |
| `config/index`           | Removed the second oversized sample; replaced it with a file map, small complete config, and task links.             |
| `config/network`         | Rewrote policy versus preference, disabled-update behavior, and verification with a screenshot.                      |
| `config/rules`           | Rewrote as a visual introduction; moved the detailed operator material to conditions.                                |
| `config/shortcuts`       | Clarified vocabulary, corrected typing guards, linked the keyboard recipe.                                           |
| `config/types`           | Added previews; moved source conversion, dates, and list parsing into data-values.                                   |
| `config/versioning`      | Rewrote around three separate version numbers and a practical migration workflow.                                    |
| `config/widgets`         | Replaced the control list with ten actual control renders, matching code, selection advice, and validation examples. |
| `dev/adapters`           | Retained interface and contract detail; simplified rationale and clarified the implementation boundary.              |
| `dev/architecture`       | Added a change-to-layer map and brought update gating up to date.                                                    |
| `dev/contributing`       | Added visual documentation conventions, all capture commands, and browser-review instructions.                       |
| `dev/core`               | Added actions/bindings to the module map; simplified historical explanations.                                        |
| `dev/ipc`                | Added Settings, session-info, recent-file, and network-log methods; qualified error-handling claims.                 |
| `dev/main`               | Updated effective config/preference gating, settings persistence, and development update behavior.                   |
| `dev/releasing`          | Made tagging and preflight guidance explicit; retained the tested release retry/signing procedure.                   |
| `dev/renderer`           | Documented the shared shortcut provider, current typing guards, and Settings.                                        |
| `dev/testing`            | Updated docs checks; removed historical detail and timing claims that do not help contributors.                      |
| `guide/exporting`        | Rewrote handoff and recovery steps; corrected Save and file-manager button names.                                    |
| `guide/keyboard`         | Clarified defaults, personal overrides, fixed bindings, and where typing suppresses shortcuts.                       |
| `guide/labeling`         | Rewrote the task flow; added radio/checkbox/error previews and completion/export distinctions.                       |
| `guide/prepare`          | Rewrote split/join steps and validation outcomes with screenshots.                                                   |
| `guide/reading-a-record` | Rewrote for labelers with source-card, nested-table, dictionary, and rule examples.                                  |
| `guide/sessions`         | Rewrote pause/resume, one-session limit, export clearing, and format compatibility.                                  |
| `guide/settings`         | Rewrote around current public Settings sections and real screenshots.                                                |
| `guide/troubleshooting`  | Corrected recovery, update, and keyboard advice; retained symptom-based lookup.                                      |
| `index`                  | Rebuilt the entry page around roles, a real beginner screen, and directly visible control previews.                  |
| `start/concepts`         | Condensed to a glossary; distinguished project/JSON schemas and saved/session-field meanings.                        |
| `start/download`         | Simplified platform/architecture choice and removed overconfident installation claims.                               |
| `start/first-run`        | Aligned instructions and screenshots with the actual beginner project and current button labels.                     |
| `start/install-macos`    | Rewrote installation steps; removed unnecessary updater internals and inaccurate quarantine claims.                  |
| `start/install-windows`  | Rewrote installer/portable choice, local storage, and unsigned-build guidance.                                       |
| `start/overview`         | Simplified the product explanation and added a concrete customer-review example.                                     |
| `start/setup`            | Removed authoring work from the labeler path and explained selecting/confirming the project.                         |
| `start/updating`         | Rewrote around Settings and config/preference permission; removed unconditional startup-check claims.                |

## Generated reference

All 16 pages remain derived from the committed JSON Schema. The root now explains when to use reference material and where to start a project. Each named-shape page identifies where its object belongs, links to a practical guide and illustrated example, and distinguishes a required configuration key from a required answer.

Reviewed shapes: InputField, OutputField, ValueType, NestedField, Fill, Choice, Card, CardRow, DisplayRule, Condition, Style, TextDisplay, FieldDisplay, TableView, and TableColumn.

## Added and split material

- Role landing pages for labelers, preparers, and administrators.
- A complete first-project tutorial with downloadable files and exact-project screenshots.
- A preparer guide to returned files, counts, duplicates, and project compatibility.
- Ten cookbook walkthroughs: multiple selections, reviewer details, renamed IDs, nested tables, dictionaries, source warnings, offline operation, semicolon-separated files, number-key forms, optional notes.
- Focused condition/operator and source-value conversion pages.
- A useful 404 page with links back to common tasks.

## Verification

- Complete prose configurations and 14 downloadable example configurations pass the app validator.
- Cookbook captures load the downloadable files through the actual Electron app; six scenarios also export through the Save button and read the resulting CSV.
- Build-time links check routes, section IDs, full-size images, and download targets.
- Browser review visits every content route in light/dark themes at 1440px and 390px, checks image loading and theme pairs, tests download expansion and search, and saves representative page captures.
- Visual review covers the role landing, cookbook, field guide, card-layout guide, and recipe pages. Mobile table column squeezing was corrected after inspection.

Run commands are documented in the contributor guide. Local browser artifacts are written to `/tmp/mlabel-docs-review` by default.
