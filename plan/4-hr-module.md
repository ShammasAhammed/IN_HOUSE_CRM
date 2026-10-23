# HR module

Oct 14, 2026 · @ahammed shammas p

HR for a 10-person agency is a different problem from HR for 200 people. Most of what HR software sells solves problems Oppllo does not have. The module is worth building only where it saves real time, keeps proper records, and feeds the Projects module things it cannot know on its own — who is available, who is on leave, who is actually carrying the load.

## What the famous HR platforms actually do

The Indian SMB market shortlists the same four, and each is built around a different idea.

| Platform | Built around | Price signal |
| --- | --- | --- |
| greytHR | India payroll and statutory compliance, built up over decades | Unified HR + payroll pricing, SMB-focused |
| Keka | Modern interface, performance and engagement workflows | Mid-market, strong UX |
| Zoho People | Modular core HR inside the Zoho suite; GPS check-in, workflow automation, Zia AI | From about ₹48–60 per user per month; payroll is a separate Zoho Payroll subscription |
| BambooHR / HiBob | Employee self-service, onboarding journeys, org charts, surveys | Per-employee, Western pricing |

Strip away the marketing and every one of them is the same nine things: employee records, attendance, leave, documents, onboarding and exit, performance reviews, payroll and compliance, self-service, and reporting.

The useful question is which of those nine actually bite at 10 people.

| Area | Worth building for Oppllo | Why |
| --- | --- | --- |
| Employee records | Yes | Nobody has one reliable list today |
| Leave and holidays | Yes | Real daily pain, and Projects needs to know |
| Attendance | Yes, simple | Needed for presence, not for policing |
| Documents | Yes | Contracts and ID proofs are scattered |
| Onboarding and exit | Yes, as checklists | Access given and removed is a security matter |
| Self-service | Yes | Removes the HR person from every small question |
| Performance | Light version only | At 10 people this is a conversation, not a workflow |
| Payroll and statutory | No | Legal risk, changes constantly. Zoho's job |
| Engagement surveys, org charts, social walls | No | Solving a problem of scale you do not have |

So roughly half of what you would pay a Zoho People subscription for is genuinely useful here. The other half is weight.

## Oppllo's real HR problems

A 10-person agency with interns, work-from-home days and occasional shoot travel has a specific set of problems, and they are not the ones HR vendors advertise.

**Nobody knows who is off until work stops.** Leave is asked for on WhatsApp and approved on WhatsApp. The person covering finds out when a client asks why the post did not go up.

**Interns churn, and each one restarts the same work.** They join across departments, need access on day one, produce files, and leave a few months later. Right now their access, their work and their learning leave with them. At 10 people with interns coming and going, this is the biggest documented-knowledge leak in the agency.

**Attendance is unclear because the place of work varies.** Office, home, and sometimes a client site for a shoot. There is no record of who was where, and no fair way to discuss it later.

**Documents live in personal phones and inboxes.** Offer letters, ID proofs, signed agreements. If you needed every team member's contract today, it would take a day to collect.

**Nobody can see who is overloaded.** This is really a Projects problem, but HR owns half the answer: capacity, leave and working days.

**The HR person is a messenger.** Every "how many leaves do I have left", "can I get a salary letter", "what are the holidays this year" goes through one person manually.

Note what is absent from this list: payroll calculation, statutory filing, compliance deadlines, recruitment at volume, performance ratings. Those are real HR problems at 50 or 200 people. Building them now would be building for an agency you do not yet run.

## Full feature list

Must means the module is not usable without it. Should means it earns its place within a few months. Later means wait until the team is bigger or the need is proven.

### People records

| Feature | Priority |
| --- | --- |
| Employee record: name, role, department, join date, reporting to, contact, emergency contact | Must |
| Employment type: full-time, intern, freelancer, part-time | Must |
| Capacity hours per week (feeds the Projects capacity view) | Must |
| Skills and tools each person can work on (editing, Meta Ads, design) | Should |
| Work location default: office, home, hybrid | Should |
| Simple team directory anyone can search | Should |
| Confirmation and probation dates with reminders | Later |

### Attendance

| Feature | Priority |
| --- | --- |
| Check-in and check-out button, with work-location tag: office, home, client site | Must |
| Today's presence board: who is in, who is at home, who is on leave, who is at a shoot | Must |
| Monthly attendance summary per person | Must |
| Optional location captured at check-in, recorded but not enforced | Should |
| Shoot-day and travel marking, so a field day is not counted as absence | Should |
| Late and short-day flags, visible to the person first, not just to HR | Should |
| Shift or roster planning | Later |
| Biometric device integration | Later |

### Leave and holidays

| Feature | Priority |
| --- | --- |
| Leave types with yearly quota: casual, sick, unpaid, comp-off | Must |
| Apply, approve or reject, with the balance shown before applying | Must |
| Leave balance visible to the person at any time | Must |
| Team leave calendar everyone can see | Must |
| Holiday list for the year, published once | Must |
| Clash warning: two people from the same department off on the same day | Should |
| Cover handover: who takes over which client while someone is away | Should |
| Half-day and short leave | Should |
| Carry-forward and encashment rules | Later |

### Documents

| Feature | Priority |
| --- | --- |
| Document locker per person: contract, offer letter, ID proof, certificates | Must |
| Letter generation: offer letter, internship certificate, experience letter, salary letter | Should |
| Expiry reminders for documents that lapse | Should |
| E-signature on letters | Later |

### Joining and leaving

| Feature | Priority |
| --- | --- |
| Joining checklist: accounts, tool access, devices, introductions, first client briefing | Must |
| Exit checklist: remove every access, collect devices, hand over clients and files | Must |
| Access register: which person has which tool and client account access | Must |
| Automatic creation of their Oppllo One login on joining | Should |
| Notice period and final-settlement tracking | Later |

### Self-service and reporting

| Feature | Priority |
| --- | --- |
| Every person sees their own attendance, leave, documents and tasks in one place | Must |
| Requests go through the system rather than WhatsApp | Must |
| Monthly HR summary: attendance, leave taken, joiners and leavers | Should |
| Headcount and cost-per-department view for the owner | Should |
| AI answers HR questions from policy and records | Should |

### Performance, kept light

| Feature | Priority |
| --- | --- |
| One-to-one notes: date, what was discussed, what was agreed | Should |
| Goals per person per quarter, three maximum | Should |
| Work evidence pulled automatically from Projects (tasks done, creatives approved, deadlines met) | Should |
| Formal appraisal cycle with ratings and forms | Later |
| 360 feedback, engagement surveys, eNPS | Later |

### Deliberately not built

Payroll calculation, PF, ESI, TDS, Form 16, payslips, statutory filing, and full recruitment or applicant tracking. These stay with Zoho or whichever payroll provider you choose.

## The intern engine

This is the one HR feature worth building that no HR platform does properly, because it is an agency problem rather than an HR problem.

Interns across departments means a constant cycle: someone joins, learns how Oppllo does things, produces work, and leaves. Each cycle currently starts from zero. Treat the intern journey as a tracked path and the agency keeps what each batch learns.

- **Batch and cohort record** — who joined when, in which department, under which mentor, for how long
- **Standard joining path per department** — the same first-week checklist every time: access, tools, reading, first supervised task
- **Training library** — the SOPs, recordings and examples a new intern needs, written once, improved each batch. This is what stops the restart
- **Mentor assignment** — one named person, visible, so nobody is left floating
- **Work record** — what they actually produced, pulled from Projects, not from memory
- **Review at the end** — short structured notes: strengths, what they worked on, hire-again or not
- **Certificate generation** — internship certificate produced from the record, in one click
- **Clean exit** — every access removed on the last day, files handed over, nothing lost
- **Talent pool** — past interns kept with their review, so hiring starts from people you already know

The quiet benefit: once the training library exists, each batch takes less of your senior people's time than the one before. That is time taken directly back from the performance marketer and designer, who are the people you least want explaining basics.

## Where HR meets Projects

This is the whole reason to build HR inside Oppllo One instead of subscribing to Zoho People. A separate HR tool knows people. Your system knows people *and* the work, so these become possible:

| Connection | What it does |
| --- | --- |
| Leave → task cover | Approved leave flags that person's tasks in that period and prompts for who covers which client |
| Capacity → Week view | Each person's capacity hours and leave feed the planning grid, so it shows real availability, not theoretical |
| Joining → access | A new person automatically gets their login, their role permissions and their joining checklist |
| Exit → security | The exit checklist reads the access register and lists every account to close, including client ad accounts |
| Skills → assignment | Assign work to people who can actually do it, and see which skill the agency is thin on |
| Work → review | One-to-ones and intern reviews draw on tasks completed and creatives approved, instead of recent memory |
| Attendance → utilisation | Working days minus leave gives the true denominator for utilisation per person |
| Leave clash → delivery risk | Two people off in the same week during a campaign shows up as a project risk, not an HR note |

None of these is possible when HR lives in one subscription and work lives in another. Each one is small; together they are the argument for the single system.

## The Zoho boundary, data safety, and build order

**Where the line sits.** Oppllo One is the source of truth for who works here, who was present, and who was on leave. Zoho Payroll is the source of truth for money and statutory matters. The connection is one-way and narrow: each month the system exports attendance and leave per person, Zoho calculates pay. Payslips and tax documents stay in Zoho; the system only links to them. Build the export now as a file download, so it works before any Zoho account exists, and add the direct connection later without changing anything else.

**Data safety, because HR data is different.** Under India's DPDP Act the rule of thumb is to store the minimum. Practically: no full Aadhaar or bank account numbers in the system — last four digits only, with the full numbers kept in the payroll software. Salary figures visible to the owner, the HR person and the accountant alone, never to managers browsing the team page. Documents stored with signed, expiring links rather than open URLs. Every view of a sensitive record written to the audit log. A person can see their own record completely, and nobody else's.

**Build order.** Three slices, each usable alone.

| Slice | What ships | What stops happening |
| --- | --- | --- |
| 1 | People records, capacity, leave types and quotas, apply and approve, leave calendar, holiday list, self-service page | Leave requests on WhatsApp; nobody knowing who is off |
| 2 | Attendance check-in with location tag, presence board, monthly summary, document locker, joining and exit checklists, access register | Scattered documents; access left open after someone leaves |
| 3 | Intern engine, training library, letter generation, one-to-one notes and goals, payroll export, AI HR answers | Each intern batch starting from zero |

Slice 1 is roughly a week of building and removes the loudest daily pain. Nothing in slice 1 depends on a decision you have not made yet, which makes HR a sensible thing to build while the hosting question stays open.
