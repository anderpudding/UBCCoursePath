# Access inquiries — prepared, not sent

These messages need the project owner's name and affiliation before sending. No institutional approval or partnership is assumed.

## UBCScheduler

Verified contact channel: the **Report Issue** button on <https://ubcscheduler.ca/> opens [this published inquiry form](https://docs.google.com/forms/d/1aPhBKcCseiP84Z_U4DqqzFh_VHpdpBpUxXrK9hqQeag/viewform). It offers a **Question** category and requires a reply email. No maintainer email was verified. Do not reuse contact information from an unrelated old project with the same name.

Subject: Partnership inquiry: course planning with historical grades

Hello UBCScheduler team,

I'm [name], [UBC affiliation], building a course-planning website for UBC Vancouver undergraduates. It combines section selection and weekly timetable generation with historical grade distributions from UBCGrades. I have a local prototype and am investigating a reliable, authorized source for current course schedules and seats.

Would you be open to discussing a shared data feed or collaboration? In particular:

Your public app's section loader currently calls `https://coursescheduler-api-eight.vercel.app/api/sections`. A single CPSC 110 lookup returned lecture/lab sections but no seat counts, source observation timestamps, academic-year field, or pairing rules. Is this the intended current production route, and which academic year does its response represent?

- Does your current integration cover published Vancouver undergraduate sections, meeting patterns, instructors, required lecture/lab/tutorial components, and valid section pairings?
- Does it include enrollment/capacity, waitlists, and reservation indicators? How are those fields defined?
- How often are the values observed upstream, and can you expose section-level observation timestamps? The target is seat information no more than five minutes old, measured from the source observation.
- Does your agreement with UBC allow another application to redistribute and cache the data, or would we need separate authorization?
- What request limits, attribution requirements, authentication, costs, and maintenance arrangements would apply?

If a shared feed is not available, a referral to the appropriate UBC team would also help. The planner will keep registration in Workday and will not collect students' CWL credentials or personal registration records.

Thank you,
[name]

## UBC IT Data & Business Intelligence

To: **ubcuit-g-dbi@mail.ubc.ca**, published on [UBC's University Data Platform page](https://cio.ubc.ca/data-governance/university-data-platform-udap). The page also links to the institutional data-access process.

Subject: Request for authorized course schedule and seat data for a student planner

Hello UBC IT Data & Business Intelligence team,

I'm [name], [UBC affiliation], developing a course-planning website for UBC Vancouver undergraduate students. It combines a weekly schedule builder with public historical grade distributions from UBCGrades. Could you advise on the appropriate access process, data owner, and whether an authorized API or shared feed is available?

The requested data is published course and section information: campus, academic term, subject and full course code, title, credits, section identifiers and status, meeting dates/times/locations, instructors, required section components and valid pairings, enrollment/capacity, waitlist counts/capacity, and reservation indicators. I am not requesting student identities, transcripts, personal saved schedules, CWL credentials, or registration actions.

For the seat feature, the target is observations no more than five minutes old. A nightly extract would support some planning features but would not meet that target. Could a suitable integration expose the actual per-section observation time and explain enrollment, waitlist, and reservation semantics?

Please also advise on eligibility or sponsorship requirements, approval for public display and caching, attribution, authentication, usage limits, costs, coverage and publication cadence, and a maintenance contact. A limited pilot covering a few courses would be sufficient to validate the connection before a wider launch.

Thank you,
[name]

## Evidence to record from responses

Record confirmed owner/contact, coverage, redistribution and caching permission, refresh commitments, timestamp semantics, quota, field meanings, and sample responses. Only after those are confirmed should the operator activate the live connector and run the freshness comparison against Workday.
