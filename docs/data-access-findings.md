# Data-access findings

Checked October 4, 2026, America/Vancouver. This is evidence from public endpoints, not institutional access approval.

## UBCScheduler's actual course-section route

The JavaScript asset linked by <https://ubcscheduler.ca/> was `/static/js/main.5c49df18.js`. Its section-loading function calls:

```text
GET https://coursescheduler-api-eight.vercel.app/api/sections
    ?subject=CPSC&number=110&term=1&session=W&campus=V
```

One request returned HTTP 200 and 29 CPSC 110 sections. The returned activity types were `Lecture` and `Laboratory`; all section status values were `Available` in this particular response. The response shape was:

```text
{ sections: [{ id, status, name, subject, course, section,
               activity, term, mode, schedule, url }] }

schedule: [{ day, term, start_time, end_time }]
```

Meeting times are represented by numbers that appear to be minutes after midnight. The section URLs point to Workday. Their semantics and current academic-year alignment have not been confirmed against Workday.

| Requirement | Evidence from this response |
|---|---|
| Section identifiers and meeting patterns | Present |
| Lecture/lab activity types | Present |
| Enrollment, total capacity, reserved/unreserved seats | Not provided |
| Waitlist counts/capacity | Not provided |
| Current instructors and meeting locations | Not provided |
| Actual upstream observation timestamps | Not provided |
| Explicit academic year / meeting date ranges | Not provided |
| Required component and valid pairing rules | Not provided |
| Permission for reuse and caching | Not established by a successful request |

The downloaded app includes code paths for reserved/unreserved-seat fields, but those fields were absent from every returned section. The code's existence does not establish that the data is currently supplied.

**Conclusion:** a functioning section lookup exists. This single response does not establish which academic year it represents, whether it is complete, whether its times match current Workday, or whether seats can be kept within five minutes. The live-seat milestone remains unmet.

The app's production build also includes static course-list modules for multiple years. Do not treat those modules or a source-level year constant as authoritative proof that the backend's returned sections belong to the requested current year.

## Follow-up for UBCScheduler

Ask whether this is the intended current production endpoint, which year it returns, whether a partner may use/cache it, whether seats/instructors/timestamps and component relationships can be supplied through an approved route, and what limits/maintenance expectations apply. There is no reliable automated adapter for full planning until those meanings and missing fields are confirmed.

The published Report Issue button opens [the team's inquiry form](https://docs.google.com/forms/d/1aPhBKcCseiP84Z_U4DqqzFh_VHpdpBpUxXrK9hqQeag/viewform). It offers the Question category and requires a reply email.

## Reproduce a limited read-only check

```sh
node scripts/probe-scheduler.js --subject CPSC --code 110 --term 1 --session W
```

The script makes one request to the route observed in the site's own public asset, then reports available fields and missing freshness information. It does not import sections into the planner, infer current-year membership, or mark them as current seats.

## UBCGrades

The documented v3 grade endpoint was verified with real reports. The actual deployed session-discovery route works without a trailing slash. The local app uses that route and real course-level historical reports, preserving campus, session, and full course codes. See the validation report and bundled snapshots for the tested coverage.

## UBC institutional route

[The University Data Platform page](https://cio.ubc.ca/data-governance/university-data-platform-udap) distinguishes nightly data processing from live integration and directs access requests to the Data & Business Intelligence team. Whether this project can obtain course-seat data under that process remains unconfirmed.
