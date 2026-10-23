// Fictional sales leads for development (D5): Kerala institutions at every stage of the pipeline.
import { newId } from "@/lib/id";
import { LEAD_STAGES, type LeadScore, type LeadStage } from "@/lib/types";

const INSTITUTIONS = [
  ["St. Mary's Nursing College", "Kottayam", "college"],
  ["Bright Future NEET Academy", "Thrissur", "coaching"],
  ["Green Valley Public School", "Malappuram", "school"],
  ["Coastal Institute of Technology", "Kollam", "college"],
  ["Lakshya PSC Coaching Centre", "Thiruvananthapuram", "coaching"],
  ["Al Noor Arts & Science College", "Kozhikode", "college"],
  ["Skyway Aviation Academy", "Kochi", "training"],
  ["Little Flower CBSE School", "Palakkad", "school"],
  ["Mentor IELTS Institute", "Kannur", "training"],
  ["Vidya Engineering Entrance", "Ernakulam", "coaching"],
  ["Riverside B.Ed College", "Pathanamthitta", "college"],
  ["Hilltop International School", "Wayanad", "school"],
] as const;
const NAMES = ["Dr. Thomas Mathew", "Sr. Lissy Joseph", "Anil Kumar", "Fathima Beevi", "Rajesh Nair", "Shameer K", "Deepa Menon", "Jose Varghese", "Asha Pillai", "Haris Rahman", "Mini George", "Suresh Babu"];
const CHANNELS = ["Meta lead form", "Landing page", "WhatsApp", "Referral", "Google lead form", "Phone call"];
const SCORES: Array<LeadScore | null> = ["hot", "warm", "cold", null];
const LOST = ["No budget", "Chose another agency", "No response", "Not interested now"];

export function seedLeads(today: string, ownerIds: string[], rand: () => number) {
  const leads: Array<Record<string, unknown>> = [];
  const activities: Array<Record<string, unknown>> = [];
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const base = new Date(`${today}T09:00:00+05:30`).getTime();
  for (let i = 0; i < 36; i++) {
    const [inst, district, segment] = INSTITUTIONS[i % INSTITUTIONS.length]!;
    const stage: LeadStage = i < 6 ? "new" : pick(LEAD_STAGES);
    const created = new Date(base - Math.floor(rand() * 40 + 1) * 86_400_000);
    const ownerId = stage === "new" && i % 2 === 0 ? null : pick(ownerIds);
    const followDays = Math.floor(rand() * 7) - 3;
    const id = newId();
    leads.push({
      id,
      name: NAMES[i % NAMES.length],
      phone: `+91 9${String(400000000 + i * 7919).slice(0, 9)}`,
      institution: i >= INSTITUTIONS.length ? `${inst} (${i})` : inst,
      district,
      segment,
      problem: pick(["Admissions down 20% this year", "Need more NEET repeaters", "New course launch", "Seats empty after first allotment"]),
      seats: 60 + (i % 5) * 30,
      feePaise: (40_000 + (i % 6) * 15_000) * 100,
      stage,
      score: pick(SCORES),
      lostReason: stage === "lost" ? pick(LOST) : null,
      origin: "landing",
      channel: pick(CHANNELS),
      campaign: pick(["Admissions 2027 – Kerala", "NEET repeaters Oct", null]),
      ownerId,
      nextFollowUpAt: stage === "won" || stage === "lost" || i % 5 === 0 ? null : new Date(base + followDays * 86_400_000),
      stageChangedAt: new Date(created.getTime() + 2 * 86_400_000),
      wonAt: stage === "won" ? new Date(created.getTime() + 10 * 86_400_000) : null,
      createdAt: created,
      updatedAt: created,
    });
    activities.push({ id: newId(), leadId: id, type: "created", text: "Lead came in", at: created });
    if (stage !== "new") activities.push({ id: newId(), leadId: id, type: "note", text: "Called the principal. Interested; send the case study.", byId: ownerId, at: new Date(created.getTime() + 86_400_000) });
  }
  return { leads, activities };
}
