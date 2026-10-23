// Kerala district names arrive spelt many ways from forms and the CRM ("Kozhikkodu", "Kozhikode", "Calicut"). The
// lead filters group them under one name (QA S6-B3); the stored spelling is left as it came.

const KERALA = ["Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam", "Idukki", "Ernakulam", "Thrissur", "Palakkad", "Malappuram", "Kozhikode", "Wayanad", "Kannur", "Kasaragod"];

/** Old English names people still type. */
const ALIASES: Record<string, string> = {
  trivandrum: "Thiruvananthapuram",
  quilon: "Kollam",
  alleppey: "Alappuzha",
  aleppey: "Alappuzha",
  kochi: "Ernakulam",
  cochin: "Ernakulam",
  trichur: "Thrissur",
  palghat: "Palakkad",
  calicut: "Kozhikode",
  cannanore: "Kannur",
  kasargod: "Kasaragod",
};

/** A spelling-proof key: letters only, doubled letters once, no vowel at the end ("kozhikkodu" and "kozhikode" → "kozhikod"). */
export function districtKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/[aeiou]+$/, "");
}

const BY_KEY = new Map<string, string>([...KERALA.map((d) => [districtKey(d), d] as const), ...Object.entries(ALIASES).map(([alias, d]) => [districtKey(alias), d] as const)]);

/** The name a district is shown and filtered under: the official Kerala name when known, else as typed (trimmed). */
export function districtName(raw: string): string {
  return BY_KEY.get(districtKey(raw)) ?? raw.trim();
}

/** Every stored spelling that belongs under one shown name. */
export function districtSpellings(shown: string, stored: readonly string[]): string[] {
  const key = districtKey(districtName(shown));
  return stored.filter((s) => districtKey(districtName(s)) === key);
}
