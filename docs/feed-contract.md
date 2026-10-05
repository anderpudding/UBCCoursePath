# Shared course feed contract

The institution or an approved partner serves the following JSON over HTTPS. Mapping their native response to this format belongs in a provider adapter once access and actual field semantics are known. This is a proposed app interface, not a claim that UBC exposes this endpoint.

```json
{
  "campus": "UBCV",
  "source": { "name": "Approved provider name", "url": "https://provider.example" },
  "terms": [{
    "id": "2026W-T1",
    "label": "2026–27 Winter Term 1",
    "courses": [{
      "campus": "UBCV", "subject": "CPSC", "code": "110",
      "title": "Computation, Programs, and Programming", "credits": 4,
      "requiredComponents": ["Lecture", "Lab"],
      "sections": [{
        "id": "2026W-T1-CPSC110-101", "label": "101", "component": "Lecture",
        "status": "open", "instructor": null,
        "compatibleWith": ["2026W-T1-CPSC110-L1A"],
        "enrolled": null, "capacity": null,
        "waitlisted": null, "waitlistCapacity": null,
        "reservationNote": null,
        "sourceObservedAt": null,
        "meetings": [{
          "days": [0, 2, 4], "start": 600, "end": 650,
          "location": null,
          "startDate": "2026-09-08", "endDate": "2026-12-04"
        }]
      }, {
        "id": "2026W-T1-CPSC110-L1A", "label": "L1A", "component": "Lab",
        "status": "open", "instructor": null,
        "enrolled": null, "capacity": null,
        "waitlisted": null, "waitlistCapacity": null,
        "reservationNote": null, "sourceObservedAt": null,
        "meetings": [{ "days": [1], "start": 840, "end": 950, "location": null }]
      }]
    }]
  }]
}
```

The times above illustrate the contract only. They are not verified offerings or current counts.

## Identity and relationships

- Course identity is `(campus, subject, complete course code)`. Keep leading zeros and suffixes such as `199A` as strings. Term IDs keep offerings separate. IDs must be unique inside a term.
- `requiredComponents` lists the components needed for one complete registration choice. The solver chooses exactly one section of each listed component. Optional components should not be put in this list.
- `compatibleWith`, when present, is an exhaustive allow-list of other section IDs from the **same course** that may be paired with this section, across all its other required components. Omission means there is no pairing restriction. Include every compatible tutorial/lab/lecture; otherwise a valid combination could be unintentionally rejected. Only emit omission when unrestricted pairing is confirmed by the provider.
- Status is `open`, `waitlist`, `closed`, or `cancelled`. Planning can include full/waitlisted sections. It cannot include cancelled sections.
- Empty meetings mean unknown scheduling information and cannot be included in a generated plan. An explicitly asynchronous section may instead supply `asynchronous: true` and `meetings: []`.

## Time and seats

- Meeting times are local campus wall-clock minutes after midnight (Vancouver); days run Monday `0` through Sunday `6`. Intervals are half-open, so back-to-back meetings do not conflict.
- Optional `startDate` and `endDate` describe the effective calendar date range and must both be supplied together. Disjoint date ranges can share a weekly slot. Recurrences more complex than weekly patterns need an adapter expansion or a solver extension before claiming accurate scheduling.
- Enrollment and capacity fields are nonnegative integers or null. Null means unknown and is displayed as a dash. Over-enrollment is allowed; there is no subtraction-based “available to you” inference.
- Reservation restrictions are displayed as `reservationNote`. Do not interpret them as personalized eligibility.
- `sourceObservedAt` is the actual UTC observation time of that section’s seat state, in ISO 8601 format with `Z` or an explicit offset. It must come from the provider. Never substitute download time, ingestion time, file modification time, or a term-level scheduling publication time.
- Missing observations remain unknown; observations older than five minutes are stale; future observations are unknown. The independent verifier measures freshness at download time using these observations, not its polling interval.
- Where enrollment, waitlists, and reservations have separate observation times, supply the oldest observation covering the displayed fields. Do not let a refreshed enrollment timestamp falsely imply a refreshed waitlist.

## Provider agreement required

Document provider ownership, authorized campus/academic-level coverage, public redistribution and caching permission, rate limits, timestamp semantics, upstream refresh commitments, reserved/waitlisted count definitions, term publication schedule, and maintenance contact. The operator approval environment flag is an attestation, not automatic evidence that permission exists.

There is no native provider adapter yet because UBC/UBCScheduler access, response format, and permitted usage have not been confirmed. The configured HTTPS connector and the verification tool are ready for that response.
