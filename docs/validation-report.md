# Validation report

Validated October 4, 2026 (America/Vancouver).

## Result

The local planner and real grade-data connection work. **Approved current course schedules, live seats, and the five-minute upstream freshness target remain unverified.** The live-feed verifier exits with an explicit blocked status when no approved feed is configured. No provider permission, partnership, or production readiness is claimed.

## Automated checks — 15 passing tests

`npm test` passes on Node.js 22.23.2. The browser app, server, and verification script pass syntax checks.

Covered scenarios:

- Complete lecture/lab/tutorial bundles with linked-section constraints; incompatible pairings fail.
- Locks survive generation; deleted and cancelled locked sections fail explicitly.
- Unpublished meeting times prevent generation unless a section is explicitly asynchronous.
- Blocked times and earliest/latest preferences constrain generation.
- Course conflicts, cancelled sections, and changed saved plans are detected.
- Half-open time intervals allow back-to-back classes; disjoint effective date ranges can coexist.
- Bounded search fails explicitly rather than returning a partial schedule.
- Freshness at exactly five minutes, immediately beyond it, with missing timestamps, with future timestamps, and in fictional demo mode.
- Exact campus/session/course-suffix matching for historical reports.
- Rejection of duplicate course identities, invalid section links, invalid timestamps (including missing timezones), non-string course codes, and invalid calendar date ranges.
- Provider approval and HTTPS requirements; outage retains the last validated snapshot without advancing its source timestamp.
- Invalid first feed does not silently substitute fictional records.
- Grade parameter validation, caching, 404/no-history handling, and labelled fallback to previously retrieved real reports.

## Real source checks

- The public UBCGrades endpoint returned actual MATH 100 reports for 2022S and 2025W. The running app returned the 2025W overall average of approximately 66.3%, with 3,641 reported grades.
- Historical session discovery returned 2021S through 2025W. The verified endpoint is `/api/v3/yearsessions/UBCV` without a trailing slash; the trailing-slash version returned 404.
- Retrieved and normalized 14 course/session responses: CPSC 110, MATH 100, DSCI 100, CHEM 121, ENGL 110, CPSC 210, and MATH 101, each for 2024W and 2025W. Bundled snapshots retain exact source URLs and retrieval timestamps.
- An invalid running-app grade query returned HTTP 400.
- UBC's published data-platform page supplies the institutional access route and contact. UBCScheduler's Report Issue button opens its published Google inquiry form with a Question category. No maintainer email was independently verified.
- A read-only request to the section route referenced in UBCScheduler's published app returned HTTP 200 and 29 CPSC 110 lecture/lab sections. The response had no seat counts, observation timestamps, explicit year, or pairing rules. This establishes endpoint availability only; see `data-access-findings.md`.

## Desktop browser checks

- The example timetable renders correctly and is plainly labelled as fictional.
- Real historical grade charts, aggregate averages, sample sizes, and historical section selectors render.
- Locking MATH 100 lecture 101 and blocking Monday 09:00–10:00 produces a clear unsatisfiable-state message. Unlocking it moves MATH 100 to lecture 102 and restores a conflict-free plan.
- Reservation notes and waitlist information remain distinct from enrollment/capacity.
- DEMO 199A displays no published historical data rather than invented statistics.
- Local choices and blocked times survive reload. Two academic terms retain separate plans.
- Compact search `MATH100` finds MATH 100.
- Test-only blocked periods were removed; the visible review state contains the three-course example and real MATH 100 grade history.
- A full-page desktop preview was saved as `planner-preview.jpg` alongside this document.

## Outstanding acceptance checks

- A mobile stylesheet is implemented. The in-app browser's requested 390px viewport override did not change the actual 1265px layout width, so mobile rendering is **not verified** in this environment. Check on a physical phone or a browser that supports viewport emulation before release.
- No approved live provider endpoint, native response format, access agreement, quotas, or timestamp semantics have been supplied. The generic HTTPS connector is ready, but a provider-specific mapping remains dependent on that information.
- Workday comparison requires a participating student and real current term data. No authenticated Workday data was accessed. Compare lectures, linked labs/tutorials, reservation indicators, waitlists, missing history, and actual changed/cancelled sections against Workday before claiming current offerings.
- Run repeated feed samples during a meaningful update window. Confirm that upstream observation timestamps advance and remain within five minutes; downloading a stable file repeatedly is insufficient.
- Verify publicly displayed data, cached use, maintenance arrangements, and coverage with the data owner. Prepared inquiries remain unsent pending the project owner's identity/affiliation and reply address.
- External deployment, production request/load testing, and public launch have not been performed.

## Launch gate

Keep sample mode explicit until access is confirmed. Publish a live-seat feature only after an approved feed covers the pilot courses, field semantics match Workday, provider observation timestamps support the freshness target, and stale/outage behavior is verified using that real source.
