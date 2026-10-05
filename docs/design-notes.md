# Design direction

The timetable is the main working surface, with the course shortlist to its left and section/grade comparisons to its right. This makes the course-planning decision visible rather than presenting a marketing landing page.

Palette: campus navy #183148, paper blue #F1F5F9, white #FFFFFF, cobalt #315CD6, fir teal #267D79, clay #AD5334. Each course has a consistent, accessible color in the catalog and calendar. Color is always accompanied by a course code.

Avenir Next (with system fallbacks) handles headings, labels, and body text. Alignment is left except for day headings. The primary hierarchy is the weekly grid, not repeated dashboard statistics. Grade bars appear within the comparison panel with an accessible table.

Desktop: course shortlist | weekly timetable | section details and historical grades.
Tablet: course shortlist | timetable; details and grades below in two columns.
Mobile: shortlist, horizontally scrollable timetable, details, grades.

Review: removed decorative hero cards and unsupported average-grade summaries. Kept the example-data banner explicit and close to the term selector. Motion is restricted to brief button feedback. All substantive operations have a visible status or failure state.
