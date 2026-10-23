// Fictional but realistic seed data for a Kerala admissions-growth agency (decision D5).
// Never put real people or clients here.

import type { ClientSegment, EmploymentType, Role, WorkLocation } from "@/lib/types";

export type SeedPerson = {
  key: string;
  fullName: string;
  roles: Role[];
  department: string;
  reportsTo: string | null;
  jobTitle: string;
  employmentType: EmploymentType;
  workLocation: WorkLocation;
  capacityHours: number;
  /** Months before today they joined. */
  joinedMonthsAgo: number;
};

export const DEPARTMENTS = [
  { name: "Leadership", head: "faisal" },
  { name: "Performance", head: "anjali" },
  { name: "Creative", head: "vishnu" },
  { name: "Social media", head: "fathima" },
  { name: "Sales", head: "ajmal" },
  { name: "Operations", head: "divya" },
] as const;

export const PEOPLE: SeedPerson[] = [
  { key: "faisal", fullName: "Faisal Rahman", roles: ["owner"], department: "Leadership", reportsTo: null, jobTitle: "Founder", employmentType: "full_time", workLocation: "hybrid", capacityHours: 20, joinedMonthsAgo: 40 },
  { key: "anjali", fullName: "Anjali Nair", roles: ["strategist"], department: "Performance", reportsTo: "faisal", jobTitle: "Growth Strategist", employmentType: "full_time", workLocation: "office", capacityHours: 40, joinedMonthsAgo: 30 },
  { key: "rahul", fullName: "Rahul Krishnan", roles: ["performance_marketer"], department: "Performance", reportsTo: "anjali", jobTitle: "Performance Marketer", employmentType: "full_time", workLocation: "office", capacityHours: 40, joinedMonthsAgo: 22 },
  { key: "fathima", fullName: "Fathima Sherin", roles: ["social_media"], department: "Social media", reportsTo: "faisal", jobTitle: "Social Media Lead", employmentType: "full_time", workLocation: "hybrid", capacityHours: 40, joinedMonthsAgo: 18 },
  { key: "vishnu", fullName: "Vishnu Prasad", roles: ["designer"], department: "Creative", reportsTo: "faisal", jobTitle: "Senior Designer", employmentType: "full_time", workLocation: "office", capacityHours: 40, joinedMonthsAgo: 26 },
  { key: "aswathy", fullName: "Aswathy Menon", roles: ["designer"], department: "Creative", reportsTo: "vishnu", jobTitle: "Designer", employmentType: "full_time", workLocation: "office", capacityHours: 40, joinedMonthsAgo: 9 },
  { key: "nikhil", fullName: "Nikhil Thomas", roles: ["video_editor"], department: "Creative", reportsTo: "vishnu", jobTitle: "Video Editor", employmentType: "full_time", workLocation: "office", capacityHours: 40, joinedMonthsAgo: 14 },
  { key: "ajmal", fullName: "Muhammed Ajmal", roles: ["bdo"], department: "Sales", reportsTo: "faisal", jobTitle: "Business Development Officer", employmentType: "full_time", workLocation: "office", capacityHours: 40, joinedMonthsAgo: 12 },
  { key: "divya", fullName: "Divya Suresh", roles: ["hr"], department: "Operations", reportsTo: "faisal", jobTitle: "HR Executive", employmentType: "part_time", workLocation: "hybrid", capacityHours: 20, joinedMonthsAgo: 10 },
  { key: "joseph", fullName: "Joseph Varghese", roles: ["accountant"], department: "Operations", reportsTo: "faisal", jobTitle: "Accountant", employmentType: "part_time", workLocation: "home", capacityHours: 16, joinedMonthsAgo: 20 },
  { key: "hiba", fullName: "Hiba Nasrin", roles: ["intern"], department: "Creative", reportsTo: "vishnu", jobTitle: "Design Intern", employmentType: "intern", workLocation: "office", capacityHours: 15, joinedMonthsAgo: 3 },
  { key: "arun", fullName: "Arun Babu", roles: ["intern"], department: "Creative", reportsTo: "nikhil", jobTitle: "Video Intern", employmentType: "intern", workLocation: "office", capacityHours: 15, joinedMonthsAgo: 2 },
  { key: "sneha", fullName: "Sneha Joy", roles: ["intern"], department: "Social media", reportsTo: "fathima", jobTitle: "Social Media Intern", employmentType: "intern", workLocation: "hybrid", capacityHours: 15, joinedMonthsAgo: 4 },
];

export type SeedService = {
  key: string;
  name: string;
  stages: string[];
  /** Recurring task titles per month, with owning role and hours. */
  monthly: Array<{ title: string; role: Role; hours: number; stage: number; creative?: boolean }>;
  /** Tasks for a one-off job, in order. */
  oneOff: Array<{ title: string; role: Role; hours: number; stage: number; creative?: boolean }>;
  deliverables: Array<{ name: string; perMonth: number }>;
};

export const SERVICES: SeedService[] = [
  {
    key: "meta_ads",
    name: "Meta ads for admissions",
    stages: ["Onboarding", "Strategy", "Creative production", "Ads live", "Reporting"],
    monthly: [
      { title: "Plan this month's campaign angles", role: "strategist", hours: 3, stage: 1 },
      { title: "Write ad copy variants", role: "performance_marketer", hours: 2, stage: 2 },
      { title: "Design static ad creatives", role: "designer", hours: 5, stage: 2, creative: true },
      { title: "Edit reel ads", role: "video_editor", hours: 6, stage: 2, creative: true },
      { title: "Launch and QA new ad sets", role: "performance_marketer", hours: 3, stage: 3 },
      { title: "Weekly ad check and budget pacing", role: "performance_marketer", hours: 2, stage: 3 },
      { title: "Lead quality review with the client", role: "strategist", hours: 1.5, stage: 3 },
      { title: "Monthly performance report", role: "strategist", hours: 3, stage: 4 },
    ],
    oneOff: [],
    deliverables: [{ name: "Ad creatives", perMonth: 10 }],
  },
  {
    key: "google_ads",
    name: "Google ads",
    stages: ["Onboarding", "Keywords and strategy", "Build", "Live", "Reporting"],
    monthly: [
      { title: "Search terms review and negatives", role: "performance_marketer", hours: 2, stage: 3 },
      { title: "Bid and budget adjustments", role: "performance_marketer", hours: 2, stage: 3 },
      { title: "Refresh responsive search ads", role: "performance_marketer", hours: 2, stage: 2 },
      { title: "Monthly Google ads report", role: "strategist", hours: 2, stage: 4 },
    ],
    oneOff: [],
    deliverables: [],
  },
  {
    key: "social_media",
    name: "Social media management",
    stages: ["Onboarding", "Content plan", "Production", "Publishing", "Reporting"],
    monthly: [
      { title: "Content calendar for the month", role: "social_media", hours: 3, stage: 1 },
      { title: "Design carousel posts", role: "designer", hours: 4, stage: 2, creative: true },
      { title: "Edit campus reels", role: "video_editor", hours: 5, stage: 2, creative: true },
      { title: "Write captions and hashtags", role: "social_media", hours: 2, stage: 2 },
      { title: "Schedule and publish posts", role: "social_media", hours: 2, stage: 3 },
      { title: "Community replies and DMs", role: "social_media", hours: 3, stage: 3 },
      { title: "Monthly social media report", role: "social_media", hours: 2, stage: 4 },
    ],
    oneOff: [],
    deliverables: [
      { name: "Reels", perMonth: 8 },
      { name: "Static posts", perMonth: 12 },
    ],
  },
  {
    key: "video_production",
    name: "Video production",
    stages: ["Brief", "Script", "Shoot", "Edit", "Delivered"],
    monthly: [
      { title: "Video brief with the client", role: "strategist", hours: 1, stage: 0 },
      { title: "Write video scripts", role: "social_media", hours: 3, stage: 1 },
      { title: "Campus shoot day", role: "video_editor", hours: 7, stage: 2 },
      { title: "Edit testimonial videos", role: "video_editor", hours: 8, stage: 3, creative: true },
      { title: "Thumbnails and end cards", role: "designer", hours: 2, stage: 3, creative: true },
    ],
    oneOff: [
      { title: "Video brief with the client", role: "strategist", hours: 1.5, stage: 0 },
      { title: "Shot list and script", role: "social_media", hours: 4, stage: 1 },
      { title: "Shoot day one", role: "video_editor", hours: 8, stage: 2 },
      { title: "Shoot day two", role: "video_editor", hours: 8, stage: 2 },
      { title: "First cut of the brand film", role: "video_editor", hours: 12, stage: 3, creative: true },
      { title: "Colour, sound and subtitles", role: "video_editor", hours: 6, stage: 3, creative: true },
      { title: "Client review and final delivery", role: "strategist", hours: 2, stage: 4 },
    ],
    deliverables: [{ name: "Videos", perMonth: 4 }],
  },
  {
    key: "landing_page",
    name: "Landing page / website",
    stages: ["Brief", "Copy and design", "Build", "Review", "Live"],
    monthly: [],
    oneOff: [
      { title: "Landing page brief and sitemap", role: "strategist", hours: 2, stage: 0 },
      { title: "Write landing page copy", role: "strategist", hours: 4, stage: 1 },
      { title: "Design landing page", role: "designer", hours: 10, stage: 1, creative: true },
      { title: "Build the page and lead form", role: "performance_marketer", hours: 8, stage: 2 },
      { title: "Pixel, CAPI and form tracking", role: "performance_marketer", hours: 3, stage: 2 },
      { title: "Client review round", role: "strategist", hours: 2, stage: 3 },
      { title: "Go live and test leads", role: "performance_marketer", hours: 2, stage: 4 },
    ],
    deliverables: [],
  },
  {
    key: "branding",
    name: "Branding and creative",
    stages: ["Discovery", "Concepts", "Refinement", "Handover"],
    monthly: [],
    oneOff: [
      { title: "Brand discovery workshop", role: "strategist", hours: 3, stage: 0 },
      { title: "Moodboards and directions", role: "designer", hours: 6, stage: 1, creative: true },
      { title: "Logo concepts", role: "designer", hours: 12, stage: 1, creative: true },
      { title: "Refine the chosen concept", role: "designer", hours: 8, stage: 2, creative: true },
      { title: "Brand guidelines document", role: "designer", hours: 8, stage: 3, creative: true },
      { title: "Social media kit", role: "designer", hours: 5, stage: 3, creative: true },
    ],
    deliverables: [],
  },
];

export type SeedEngagement = {
  service: string;
  kind: "retainer" | "one_off";
  /** Months before the current month the engagement began; fractional day via startDay. */
  startMonthsAgo: number;
  startDay: number;
  /** Hours per month (retainer) or total (one-off). */
  hours: number;
  /** Rupees per month (retainer) or total (one-off). */
  feeRupees: number;
  rollover?: boolean;
  /** For one-offs: duration in days. */
  durationDays?: number;
  /** A fee change this many months ago, to the new amount. */
  feeChange?: { monthsAgo: number; feeRupees: number };
  /** How hard this client is serviced vs budget: 1.0 = exactly on budget. */
  load: number;
  status?: "active" | "paused" | "ended";
};

export type SeedClient = {
  name: string;
  legalName: string;
  segment: ClientSegment;
  city: string;
  strategist: string;
  team: string[];
  contacts: Array<{ name: string; designation: string; phone: string; email: string; primary?: boolean }>;
  gstin: string;
  engagements: SeedEngagement[];
  status?: "active" | "paused";
};

export const CLIENTS: SeedClient[] = [
  {
    name: "Zenith IAS Academy",
    legalName: "Zenith Civil Services Academy Pvt Ltd",
    segment: "coaching",
    city: "Thiruvananthapuram",
    strategist: "anjali",
    team: ["rahul", "vishnu", "nikhil", "fathima", "hiba"],
    contacts: [
      { name: "Dr. Harikumar S", designation: "Director", phone: "+91 94470 11223", email: "director@zenithias.example", primary: true },
      { name: "Lekha R", designation: "Admissions head", phone: "+91 98950 44556", email: "admissions@zenithias.example" },
    ],
    gstin: "32AAACZ1234A1Z5",
    engagements: [
      { service: "meta_ads", kind: "retainer", startMonthsAgo: 14, startDay: 1, hours: 40, feeRupees: 55_000, load: 1.12, feeChange: { monthsAgo: 3, feeRupees: 65_000 } },
      { service: "social_media", kind: "retainer", startMonthsAgo: 9, startDay: 1, hours: 30, feeRupees: 35_000, load: 0.92 },
    ],
  },
  {
    name: "Brightpath Nursing College",
    legalName: "Brightpath Educational Trust",
    segment: "college",
    city: "Kochi",
    strategist: "anjali",
    team: ["rahul", "aswathy", "fathima"],
    contacts: [
      { name: "Sr. Mercy Jacob", designation: "Principal", phone: "+91 94461 22334", email: "principal@brightpath.example", primary: true },
      { name: "Bibin Paul", designation: "Marketing coordinator", phone: "+91 97440 66778", email: "marketing@brightpath.example" },
    ],
    gstin: "32AABTB5678C1Z2",
    engagements: [
      { service: "meta_ads", kind: "retainer", startMonthsAgo: 11, startDay: 1, hours: 35, feeRupees: 50_000, load: 0.85, rollover: true },
      { service: "google_ads", kind: "retainer", startMonthsAgo: 5, startDay: 1, hours: 12, feeRupees: 20_000, load: 0.9 },
    ],
  },
  {
    name: "CodeLeap Academy",
    legalName: "CodeLeap Learning LLP",
    segment: "training_institute",
    city: "Kozhikode",
    strategist: "anjali",
    team: ["rahul", "nikhil", "vishnu", "arun"],
    contacts: [{ name: "Salman Faris", designation: "Co-founder", phone: "+91 90370 88990", email: "salman@codeleap.example", primary: true }],
    gstin: "32AAQFC2468D1Z9",
    engagements: [
      { service: "meta_ads", kind: "retainer", startMonthsAgo: 8, startDay: 1, hours: 30, feeRupees: 45_000, load: 0.95 },
      { service: "video_production", kind: "retainer", startMonthsAgo: 6, startDay: 1, hours: 24, feeRupees: 40_000, load: 1.05 },
    ],
  },
  {
    name: "Al Ameen Public School",
    legalName: "Al Ameen Educational Society",
    segment: "school",
    city: "Malappuram",
    strategist: "anjali",
    team: ["fathima", "aswathy", "sneha"],
    contacts: [
      { name: "Abdul Latheef K", designation: "Manager", phone: "+91 94960 13579", email: "manager@alameenschool.example", primary: true },
    ],
    gstin: "32AAAAA9876E1Z1",
    engagements: [{ service: "social_media", kind: "retainer", startMonthsAgo: 3, startDay: 16, hours: 25, feeRupees: 28_000, load: 0.75 }],
  },
  {
    name: "LearnLoop",
    legalName: "LearnLoop Edtech Pvt Ltd",
    segment: "edtech",
    city: "Bengaluru",
    strategist: "anjali",
    team: ["rahul", "vishnu", "nikhil", "aswathy"],
    contacts: [
      { name: "Priya Raghavan", designation: "Head of growth", phone: "+91 99860 24680", email: "priya@learnloop.example", primary: true },
      { name: "Karthik N", designation: "Performance lead", phone: "+91 98450 13570", email: "karthik@learnloop.example" },
    ],
    gstin: "29AAECL1357F1Z4",
    engagements: [
      { service: "meta_ads", kind: "retainer", startMonthsAgo: 7, startDay: 1, hours: 50, feeRupees: 85_000, load: 0.88 },
      { service: "google_ads", kind: "retainer", startMonthsAgo: 7, startDay: 1, hours: 20, feeRupees: 30_000, load: 0.8 },
    ],
  },
  {
    name: "Medcrest NEET Coaching",
    legalName: "Medcrest Academy Pvt Ltd",
    segment: "coaching",
    city: "Thrissur",
    strategist: "anjali",
    team: ["rahul", "aswathy", "vishnu"],
    contacts: [{ name: "Dr. Anoop Menon", designation: "Managing director", phone: "+91 94477 97531", email: "anoop@medcrest.example", primary: true }],
    gstin: "32AAHCM8642G1Z7",
    engagements: [
      { service: "meta_ads", kind: "retainer", startMonthsAgo: 10, startDay: 1, hours: 35, feeRupees: 50_000, load: 0.97 },
      { service: "landing_page", kind: "one_off", startMonthsAgo: 1, startDay: 6, hours: 30, feeRupees: 60_000, durationDays: 35, load: 1.1 },
    ],
  },
  {
    name: "Skyline Aviation Institute",
    legalName: "Skyline Aviation Training Pvt Ltd",
    segment: "training_institute",
    city: "Kochi",
    strategist: "anjali",
    team: ["rahul", "vishnu", "aswathy", "hiba"],
    contacts: [
      { name: "Capt. Roshan D'Souza", designation: "CEO", phone: "+91 98470 86420", email: "roshan@skylineaviation.example", primary: true },
      { name: "Meera Nambiar", designation: "Admissions manager", phone: "+91 97450 75319", email: "meera@skylineaviation.example" },
    ],
    gstin: "32AAJCS7531H1Z3",
    engagements: [
      { service: "branding", kind: "one_off", startMonthsAgo: 4, startDay: 4, hours: 45, feeRupees: 1_20_000, durationDays: 50, load: 1.15, status: "ended" },
      { service: "meta_ads", kind: "retainer", startMonthsAgo: 2, startDay: 18, hours: 40, feeRupees: 60_000, load: 0.9 },
    ],
  },
  {
    name: "St. Gregory's Arts & Science College",
    legalName: "St. Gregory's Educational Society",
    segment: "college",
    city: "Kottayam",
    strategist: "anjali",
    team: ["fathima", "nikhil", "sneha", "arun"],
    contacts: [{ name: "Fr. Thomas Kurian", designation: "Bursar", phone: "+91 94950 36925", email: "bursar@stgregorys.example", primary: true }],
    gstin: "32AAATS1593J1Z6",
    status: "paused",
    engagements: [
      { service: "social_media", kind: "retainer", startMonthsAgo: 12, startDay: 1, hours: 25, feeRupees: 30_000, load: 0.7, status: "paused" },
      { service: "video_production", kind: "one_off", startMonthsAgo: 5, startDay: 10, hours: 40, feeRupees: 90_000, durationDays: 40, load: 0.95, status: "ended" },
    ],
  },
];
