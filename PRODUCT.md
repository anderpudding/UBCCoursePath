# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

UBC Vancouver undergraduates building next term's timetable in the weeks before and during their Workday registration window. They arrive with a rough list of courses (some required, some electives still in play) and need to turn it into a week that fits their other commitments, then pick between sections with enough confidence to register. Registration itself happens in Workday; Coursepath is where the decision gets made.

## Product Purpose

Coursepath lets a student shortlist courses for a term, generate compatible lecture/lab/tutorial combinations around their constraints, and compare sections using real UBCGrades history, all on one working surface. Success is a student leaving with a timetable they trust and the section choices to enter in Workday, without juggling separate tabs for scheduling and grade research.

## Positioning

Schedule building and grade history in the same place. UBCScheduler builds timetables; UBCGrades shows distributions; Workday registers. Coursepath's edge is putting the weekly timetable and section-level grade comparison side by side so the trade-off between "fits my week" and "how has this course gone historically" is visible in one decision.

## Operating Context

- Used in the run-up to and during a student's Workday registration window, often under time pressure and alongside the Workday tab.
- The student's own constraints drive the plan: earliest start, latest finish, blocked time (work, commute, lunch), locked sections.
- Separate saved plans per academic term, stored in the browser with no account. Plans can be exported as a JSON record; exporting never enrols.
- Hand-off is explicit: "Open Workday" to register; eligibility and registration are always confirmed there.

## Capabilities and Constraints

- Course search by code or title; per-term shortlist; schedule generation in a browser worker (capped at 200,000 explored states; asks for narrower choices rather than returning a partial plan).
- Respects linked sections, locked sections, blocked times, and start/finish preferences. Revalidates saved plans when course data changes and surfaces explicit errors for missing courses, cancelled sections, unknown meeting times, and conflicting preferences.
- Real historical grade distributions, sample sizes, and teaching teams from the UBCGrades v3 API, matched exactly by course suffix, campus, and historical session. A 404 means no published history, never a synthesized estimate.
- Data provenance is a standing product behaviour: schedule data and grade history have separate sources; seat counts show capacity, never personal eligibility; current-section freshness is labelled (current / out of date / freshness unknown); demo data is labelled as fictional; a failed approved feed never falls back to demo data. Historical sections and instructors are never auto-matched to current ones.
- No approved schedule-and-seat feed is connected yet. Default schedules, instructor placeholders, locations, and seat counts are fictional examples. The five-minute live-seat milestone is not demonstrated. See `docs/data-access-findings.md` and `docs/access-inquiries.md`.
- Stack: Node.js 22.9+ server (`server.js`) with plain browser JavaScript, HTML, and CSS in `public/`; no package dependencies. Server sets a strict Content-Security-Policy.
- Direction: intended to be hosted publicly for other UBC-V students. Currently a local MVP bound to loopback; hosting, deployment configuration, provider approval, and production load testing are undecided and outstanding.
- Out of scope today: accounts and sync, alerts, personalised eligibility, institutional integration. No Workday credentials or personal registration data are collected.

## Brand Commitments

- Name: Coursepath. Existing footer copy describes it as "An independent student tool" for planning at UBC.

## Evidence on Hand

- Real UBCGrades snapshots for seven courses across 2024W and 2025W with source URLs and retrieval times: `data/grade-snapshots.json`.
- Current-state screenshot: `docs/planner-preview.jpg`.
- Data-access research and validation status: `docs/data-access-findings.md`, `docs/feed-contract.md`, `docs/validation-report.md`.
- No users, testimonials, usage numbers, or endorsements exist. Do not fabricate them, and do not present demo schedules or seat counts as real.

## Product Principles

1. The decision is the product. The timetable and section comparison are the main surface; nothing competes with them for attention.
2. Every number carries its source. Seats, grades, and times say where they came from and how fresh they are; unknown is shown as unknown.
3. Registration lives in Workday. Coursepath prepares the choice and hands off cleanly; it never implies enrolment or eligibility.
4. Past is not present. Historical grades describe past classes and teaching teams, not a student's expected grade or this term's section.
5. No account required. A student can plan, save, and export without signing in or giving personal data.
