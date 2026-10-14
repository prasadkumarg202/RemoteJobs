// Country / region dictionary used for remote eligibility parsing.

export const COUNTRIES: Record<string, { name: string; region: string[]; aliases: string[] }> = {
  IN: { name: "India", region: ["asia", "apac", "south_asia"], aliases: ["india", "bharat", "ind"] },
  US: { name: "United States", region: ["north_america", "americas"], aliases: ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a.", "us-only", "us only"] },
  CA: { name: "Canada", region: ["north_america", "americas"], aliases: ["canada"] },
  MX: { name: "Mexico", region: ["latam", "americas", "north_america"], aliases: ["mexico", "méxico"] },
  BR: { name: "Brazil", region: ["latam", "americas"], aliases: ["brazil", "brasil"] },
  AR: { name: "Argentina", region: ["latam", "americas"], aliases: ["argentina"] },
  CO: { name: "Colombia", region: ["latam", "americas"], aliases: ["colombia"] },
  CL: { name: "Chile", region: ["latam", "americas"], aliases: ["chile"] },
  PE: { name: "Peru", region: ["latam", "americas"], aliases: ["peru"] },
  GB: { name: "United Kingdom", region: ["europe", "emea"], aliases: ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales"] },
  IE: { name: "Ireland", region: ["europe", "emea", "eu"], aliases: ["ireland"] },
  DE: { name: "Germany", region: ["europe", "emea", "eu"], aliases: ["germany", "deutschland"] },
  FR: { name: "France", region: ["europe", "emea", "eu"], aliases: ["france"] },
  ES: { name: "Spain", region: ["europe", "emea", "eu"], aliases: ["spain", "españa"] },
  PT: { name: "Portugal", region: ["europe", "emea", "eu"], aliases: ["portugal"] },
  IT: { name: "Italy", region: ["europe", "emea", "eu"], aliases: ["italy"] },
  NL: { name: "Netherlands", region: ["europe", "emea", "eu"], aliases: ["netherlands", "holland", "the netherlands"] },
  BE: { name: "Belgium", region: ["europe", "emea", "eu"], aliases: ["belgium"] },
  CH: { name: "Switzerland", region: ["europe", "emea"], aliases: ["switzerland"] },
  AT: { name: "Austria", region: ["europe", "emea", "eu"], aliases: ["austria"] },
  SE: { name: "Sweden", region: ["europe", "emea", "eu"], aliases: ["sweden"] },
  NO: { name: "Norway", region: ["europe", "emea"], aliases: ["norway"] },
  DK: { name: "Denmark", region: ["europe", "emea", "eu"], aliases: ["denmark"] },
  FI: { name: "Finland", region: ["europe", "emea", "eu"], aliases: ["finland"] },
  PL: { name: "Poland", region: ["europe", "emea", "eu"], aliases: ["poland"] },
  CZ: { name: "Czechia", region: ["europe", "emea", "eu"], aliases: ["czechia", "czech republic"] },
  RO: { name: "Romania", region: ["europe", "emea", "eu"], aliases: ["romania"] },
  UA: { name: "Ukraine", region: ["europe", "emea"], aliases: ["ukraine"] },
  GR: { name: "Greece", region: ["europe", "emea", "eu"], aliases: ["greece"] },
  TR: { name: "Turkey", region: ["europe", "emea", "middle_east"], aliases: ["turkey", "türkiye", "turkiye"] },
  IL: { name: "Israel", region: ["middle_east", "emea"], aliases: ["israel"] },
  AE: { name: "United Arab Emirates", region: ["middle_east", "emea"], aliases: ["united arab emirates", "uae", "dubai", "abu dhabi"] },
  SA: { name: "Saudi Arabia", region: ["middle_east", "emea"], aliases: ["saudi arabia", "ksa"] },
  QA: { name: "Qatar", region: ["middle_east", "emea"], aliases: ["qatar"] },
  EG: { name: "Egypt", region: ["africa", "emea", "middle_east"], aliases: ["egypt"] },
  NG: { name: "Nigeria", region: ["africa", "emea"], aliases: ["nigeria"] },
  KE: { name: "Kenya", region: ["africa", "emea"], aliases: ["kenya"] },
  ZA: { name: "South Africa", region: ["africa", "emea"], aliases: ["south africa"] },
  PK: { name: "Pakistan", region: ["asia", "apac", "south_asia"], aliases: ["pakistan"] },
  BD: { name: "Bangladesh", region: ["asia", "apac", "south_asia"], aliases: ["bangladesh"] },
  LK: { name: "Sri Lanka", region: ["asia", "apac", "south_asia"], aliases: ["sri lanka"] },
  NP: { name: "Nepal", region: ["asia", "apac", "south_asia"], aliases: ["nepal"] },
  SG: { name: "Singapore", region: ["asia", "apac"], aliases: ["singapore"] },
  MY: { name: "Malaysia", region: ["asia", "apac"], aliases: ["malaysia"] },
  ID: { name: "Indonesia", region: ["asia", "apac"], aliases: ["indonesia"] },
  PH: { name: "Philippines", region: ["asia", "apac"], aliases: ["philippines"] },
  TH: { name: "Thailand", region: ["asia", "apac"], aliases: ["thailand"] },
  VN: { name: "Vietnam", region: ["asia", "apac"], aliases: ["vietnam", "viet nam"] },
  JP: { name: "Japan", region: ["asia", "apac"], aliases: ["japan"] },
  KR: { name: "South Korea", region: ["asia", "apac"], aliases: ["south korea", "korea"] },
  CN: { name: "China", region: ["asia", "apac"], aliases: ["china"] },
  HK: { name: "Hong Kong", region: ["asia", "apac"], aliases: ["hong kong"] },
  TW: { name: "Taiwan", region: ["asia", "apac"], aliases: ["taiwan"] },
  AU: { name: "Australia", region: ["apac", "oceania"], aliases: ["australia"] },
  NZ: { name: "New Zealand", region: ["apac", "oceania"], aliases: ["new zealand"] },
};

export const REGIONS: Record<string, { name: string; aliases: string[]; includesIndia: boolean }> = {
  worldwide: { name: "Worldwide", aliases: ["worldwide", "anywhere", "global", "globally", "anywhere in the world", "work from anywhere", "international", "all countries"], includesIndia: true },
  apac: { name: "APAC", aliases: ["apac", "asia pacific", "asia-pacific", "asia/pacific"], includesIndia: true },
  asia: { name: "Asia", aliases: ["asia"], includesIndia: true },
  south_asia: { name: "South Asia", aliases: ["south asia", "indian subcontinent"], includesIndia: true },
  emea: { name: "EMEA", aliases: ["emea"], includesIndia: false },
  europe: { name: "Europe", aliases: ["europe", "european"], includesIndia: false },
  eu: { name: "European Union", aliases: ["eu", "european union", "eu only"], includesIndia: false },
  north_america: { name: "North America", aliases: ["north america"], includesIndia: false },
  americas: { name: "Americas", aliases: ["americas", "the americas"], includesIndia: false },
  latam: { name: "LATAM", aliases: ["latam", "latin america", "south america", "central america"], includesIndia: false },
  africa: { name: "Africa", aliases: ["africa"], includesIndia: false },
  middle_east: { name: "Middle East", aliases: ["middle east", "mena", "gcc"], includesIndia: false },
  oceania: { name: "Oceania", aliases: ["oceania", "anz"], includesIndia: false },
};

/** Indian cities commonly seen in listings → state. */
export const INDIAN_CITIES: Record<string, string> = {
  hyderabad: "Telangana", secunderabad: "Telangana", warangal: "Telangana",
  visakhapatnam: "Andhra Pradesh", vizag: "Andhra Pradesh", vijayawada: "Andhra Pradesh", guntur: "Andhra Pradesh",
  tirupati: "Andhra Pradesh", nellore: "Andhra Pradesh", kakinada: "Andhra Pradesh", rajahmundry: "Andhra Pradesh",
  bengaluru: "Karnataka", bangalore: "Karnataka", mysuru: "Karnataka", chennai: "Tamil Nadu", coimbatore: "Tamil Nadu",
  mumbai: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra", delhi: "Delhi", "new delhi": "Delhi",
  noida: "Uttar Pradesh", gurugram: "Haryana", gurgaon: "Haryana", kolkata: "West Bengal", ahmedabad: "Gujarat",
  kochi: "Kerala", trivandrum: "Kerala", thiruvananthapuram: "Kerala", jaipur: "Rajasthan", indore: "Madhya Pradesh",
  chandigarh: "Chandigarh", bhubaneswar: "Odisha",
};

const ALIAS_INDEX: Array<{ re: RegExp; code: string }> = [];
for (const [code, c] of Object.entries(COUNTRIES)) {
  for (const a of [c.name.toLowerCase(), ...c.aliases]) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Two-letter aliases ("us", "uk") must be uppercase in the source to avoid matching words.
    const flags = a.replace(/[^a-z]/g, "").length <= 2 ? "" : "i";
    const pat = flags ? esc : esc.toUpperCase();
    ALIAS_INDEX.push({ re: new RegExp(`(?<![A-Za-z])${pat}(?![A-Za-z])`, flags), code });
  }
}
const REGION_INDEX: Array<{ re: RegExp; key: string }> = [];
for (const [key, r] of Object.entries(REGIONS)) {
  for (const a of r.aliases) {
    const esc = a.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const short = a.replace(/[^a-z]/g, "").length <= 2;
    REGION_INDEX.push({ re: new RegExp(`(?<![A-Za-z])${short ? esc.toUpperCase() : esc}(?![A-Za-z])`, short ? "" : "i"), key });
  }
}

export function findCountries(text: string): string[] {
  const out = new Set<string>();
  for (const { re, code } of ALIAS_INDEX) if (re.test(text)) out.add(code);
  return [...out];
}

export function findRegions(text: string): string[] {
  const out = new Set<string>();
  for (const { re, key } of REGION_INDEX) if (re.test(text)) out.add(key);
  return [...out];
}

export function countryCode(nameOrCode: string): string | null {
  const s = nameOrCode.trim();
  if (/^[A-Z]{2}$/.test(s) && COUNTRIES[s]) return s;
  const found = findCountries(s.length <= 3 ? s.toUpperCase() : s);
  return found[0] ?? null;
}

export function countryName(code: string): string {
  return COUNTRIES[code]?.name ?? code;
}

export function regionName(key: string): string {
  return REGIONS[key]?.name ?? key;
}
