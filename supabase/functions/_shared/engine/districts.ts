// Districts of Andhra Pradesh (28, incl. Markapuram & Polavaram from 31 Dec 2025) and Telangana (33).
// `localities` are neighbourhoods / tech parks checked before town names, so
// "Gachibowli, Hyderabad" resolves to Ranga Reddy rather than Hyderabad district.

export type StateCode = "AP" | "TS";
export const STATE_NAMES: Record<StateCode, { name: string; name_te: string }> = {
  AP: { name: "Andhra Pradesh", name_te: "ఆంధ్రప్రదేశ్" },
  TS: { name: "Telangana", name_te: "తెలంగాణ" },
};

export interface District {
  slug: string;
  name: string;
  name_te: string;
  state: StateCode;
  /** Headquarters town, used as the city when a listing names only the district. */
  hq: string;
  /** Town / alternate names (word-boundary matched, case-insensitive). */
  aliases: string[];
  localities?: string[];
}

const d = (state: StateCode, slug: string, name: string, name_te: string, hq: string, aliases: string[] = [], localities: string[] = []): District =>
  ({ slug, name, name_te, state, hq, aliases, localities });

export const DISTRICTS: District[] = [
  // Andhra Pradesh
  d("AP", "alluri-sitharama-raju", "Alluri Sitharama Raju", "అల్లూరి సీతారామరాజు", "Paderu", ["alluri sitharama raju", "paderu", "araku"]),
  d("AP", "anakapalli", "Anakapalli", "అనకాపల్లి", "Anakapalli", ["anakapalli", "anakapalle"]),
  d("AP", "ananthapuramu", "Ananthapuramu", "అనంతపురం", "Anantapur", ["ananthapuramu", "anantapur", "anantapuram", "ananthapur", "guntakal", "tadipatri"]),
  d("AP", "annamayya", "Annamayya", "అన్నమయ్య", "Madanapalle", ["annamayya", "madanapalle", "madanapalli", "rayachoti"]),
  d("AP", "bapatla", "Bapatla", "బాపట్ల", "Bapatla", ["bapatla", "chirala"]),
  d("AP", "chittoor", "Chittoor", "చిత్తూరు", "Chittoor", ["chittoor", "kuppam"]),
  d("AP", "konaseema", "Dr. B. R. Ambedkar Konaseema", "డా. బి.ఆర్. అంబేద్కర్ కోనసీమ", "Amalapuram", ["konaseema", "amalapuram"]),
  d("AP", "east-godavari", "East Godavari", "తూర్పు గోదావరి", "Rajamahendravaram", ["east godavari", "rajahmundry", "rajamahendravaram", "rajamundry"]),
  d("AP", "eluru", "Eluru", "ఏలూరు", "Eluru", ["eluru", "jangareddygudem"]),
  d("AP", "guntur", "Guntur", "గుంటూరు", "Guntur", ["guntur", "tenali", "mangalagiri", "amaravati"]),
  d("AP", "kakinada", "Kakinada", "కాకినాడ", "Kakinada", ["kakinada", "peddapuram", "samalkot"]),
  d("AP", "krishna", "Krishna", "కృష్ణా", "Machilipatnam", ["krishna district", "machilipatnam", "gudivada", "gannavaram"]),
  d("AP", "kurnool", "Kurnool", "కర్నూలు", "Kurnool", ["kurnool", "adoni"]),
  d("AP", "markapuram", "Markapuram", "మార్కాపురం", "Markapuram", ["markapuram", "markapur"]),
  d("AP", "nandyal", "Nandyal", "నంద్యాల", "Nandyal", ["nandyal"]),
  d("AP", "nellore", "Sri Potti Sriramulu Nellore", "శ్రీ పొట్టి శ్రీరాములు నెల్లూరు", "Nellore", ["nellore", "kavali"]),
  d("AP", "ntr", "NTR", "ఎన్టీఆర్", "Vijayawada", ["ntr district", "vijayawada", "bezawada", "nandigama", "jaggayyapeta"]),
  d("AP", "palnadu", "Palnadu", "పల్నాడు", "Narasaraopet", ["palnadu", "narasaraopet", "narasaraopeta", "chilakaluripet"]),
  d("AP", "parvathipuram-manyam", "Parvathipuram Manyam", "పార్వతీపురం మన్యం", "Parvathipuram", ["parvathipuram", "parvathipuram manyam"]),
  d("AP", "polavaram", "Polavaram", "పోలవరం", "Rampachodavaram", ["polavaram", "rampachodavaram"]),
  d("AP", "prakasam", "Prakasam", "ప్రకాశం", "Ongole", ["prakasam", "ongole"]),
  d("AP", "srikakulam", "Srikakulam", "శ్రీకాకుళం", "Srikakulam", ["srikakulam"]),
  d("AP", "sri-sathya-sai", "Sri Sathya Sai", "శ్రీ సత్యసాయి", "Puttaparthi", ["sri sathya sai", "puttaparthi", "hindupur", "dharmavaram"]),
  d("AP", "tirupati", "Tirupati", "తిరుపతి", "Tirupati", ["tirupati", "tirupathi", "srikalahasti", "sri city"]),
  d("AP", "visakhapatnam", "Visakhapatnam", "విశాఖపట్నం", "Visakhapatnam", ["visakhapatnam", "vishakhapatnam", "vishakapatnam", "vizag", "gajuwaka"]),
  d("AP", "vizianagaram", "Vizianagaram", "విజయనగరం", "Vizianagaram", ["vizianagaram", "vizianagram"]),
  d("AP", "west-godavari", "West Godavari", "పశ్చిమ గోదావరి", "Bhimavaram", ["west godavari", "bhimavaram", "palakollu", "narsapur", "narasapuram"]),
  d("AP", "ysr-kadapa", "YSR Kadapa", "వైఎస్ఆర్ కడప", "Kadapa", ["kadapa", "cuddapah", "ysr kadapa", "proddatur"]),
  // Telangana
  d("TS", "adilabad", "Adilabad", "అదిలాబాద్", "Adilabad", ["adilabad"]),
  d("TS", "bhadradri-kothagudem", "Bhadradri Kothagudem", "భద్రాద్రి కొత్తగూడెం", "Kothagudem", ["kothagudem", "bhadrachalam", "bhadradri", "paloncha"]),
  d("TS", "hanumakonda", "Hanumakonda", "హనుమకొండ", "Hanumakonda", ["hanumakonda", "hanamkonda", "kazipet"]),
  d("TS", "hyderabad", "Hyderabad", "హైదరాబాద్", "Hyderabad", ["hyderabad", "secunderabad"],
    ["ameerpet", "begumpet", "banjara hills", "jubilee hills", "abids", "himayatnagar", "somajiguda", "panjagutta", "punjagutta", "koti", "nampally", "mehdipatnam", "tolichowki", "khairatabad", "masab tank", "lakdikapul", "charminar", "musheerabad", "amberpet"]),
  d("TS", "jagtial", "Jagtial", "జగిత్యాల", "Jagtial", ["jagtial", "jagitial", "korutla", "metpally"]),
  d("TS", "jangaon", "Jangaon", "జనగామ", "Jangaon", ["jangaon", "jangoan", "janagama"]),
  d("TS", "jayashankar-bhupalpally", "Jayashankar Bhupalpally", "జయశంకర్ భూపాలపల్లి", "Bhupalpally", ["bhupalpally", "bhupalpalle", "jayashankar"]),
  d("TS", "jogulamba-gadwal", "Jogulamba Gadwal", "జోగులాంబ గద్వాల", "Gadwal", ["gadwal", "jogulamba"]),
  d("TS", "kamareddy", "Kamareddy", "కామారెడ్డి", "Kamareddy", ["kamareddy", "banswada"]),
  d("TS", "karimnagar", "Karimnagar", "కరీంనగర్", "Karimnagar", ["karimnagar", "huzurabad"]),
  d("TS", "khammam", "Khammam", "ఖమ్మం", "Khammam", ["khammam", "sathupalli"]),
  d("TS", "kumuram-bheem-asifabad", "Kumuram Bheem Asifabad", "కుమురం భీం ఆసిఫాబాద్", "Asifabad", ["asifabad", "kagaznagar", "komaram bheem", "kumuram bheem"]),
  d("TS", "mahabubabad", "Mahabubabad", "మహబూబాబాద్", "Mahabubabad", ["mahabubabad", "mahbubabad"]),
  d("TS", "mahabubnagar", "Mahabubnagar", "మహబూబ్‌నగర్", "Mahabubnagar", ["mahabubnagar", "mahbubnagar", "palamuru", "jadcherla"]),
  d("TS", "mancherial", "Mancherial", "మంచిర్యాల", "Mancherial", ["mancherial", "bellampalli"]),
  d("TS", "medak", "Medak", "మెదక్", "Medak", ["medak", "toopran"]),
  d("TS", "medchal-malkajgiri", "Medchal–Malkajgiri", "మేడ్చల్-మల్కాజిగిరి", "Medchal", ["medchal", "malkajgiri"],
    ["kukatpally", "uppal", "kompally", "alwal", "ecil", "kapra", "quthbullapur", "bachupally", "nizampet", "boduppal", "ghatkesar", "keesara", "jeedimetla", "suchitra", "pragathi nagar"]),
  d("TS", "mulugu", "Mulugu", "ములుగు", "Mulugu", ["mulugu", "eturnagaram"]),
  d("TS", "nagarkurnool", "Nagarkurnool", "నాగర్‌కర్నూల్", "Nagarkurnool", ["nagarkurnool", "achampet", "kalwakurthy"]),
  d("TS", "nalgonda", "Nalgonda", "నల్గొండ", "Nalgonda", ["nalgonda", "miryalaguda", "devarakonda"]),
  d("TS", "narayanpet", "Narayanpet", "నారాయణపేట", "Narayanpet", ["narayanpet"]),
  d("TS", "nirmal", "Nirmal", "నిర్మల్", "Nirmal", ["nirmal", "bhainsa"]),
  d("TS", "nizamabad", "Nizamabad", "నిజామాబాద్", "Nizamabad", ["nizamabad", "bodhan", "armoor"]),
  d("TS", "peddapalli", "Peddapalli", "పెద్దపల్లి", "Peddapalli", ["peddapalli", "peddapalle", "ramagundam", "godavarikhani"]),
  d("TS", "rajanna-sircilla", "Rajanna Sircilla", "రాజన్న సిరిసిల్ల", "Sircilla", ["sircilla", "siricilla", "vemulawada", "rajanna"]),
  d("TS", "ranga-reddy", "Ranga Reddy", "రంగారెడ్డి", "Hyderabad", ["ranga reddy", "rangareddy", "shamshabad", "ibrahimpatnam", "chevella"],
    ["gachibowli", "hitec city", "hitech city", "madhapur", "kondapur", "financial district", "nanakramguda", "manikonda", "narsingi", "kokapet", "serilingampally", "lb nagar", "l.b. nagar", "rajendranagar", "attapur", "hayathnagar", "dilsukhnagar", "vanasthalipuram", "adibatla", "kongara kalan"]),
  d("TS", "sangareddy", "Sangareddy", "సంగారెడ్డి", "Sangareddy", ["sangareddy", "patancheru", "zaheerabad", "sadasivpet"], ["ameenpur", "ramachandrapuram", "bhel"]),
  d("TS", "siddipet", "Siddipet", "సిద్దిపేట", "Siddipet", ["siddipet", "gajwel"]),
  d("TS", "suryapet", "Suryapet", "సూర్యాపేట", "Suryapet", ["suryapet", "kodad", "huzurnagar"]),
  d("TS", "vikarabad", "Vikarabad", "వికారాబాద్", "Vikarabad", ["vikarabad", "tandur"]),
  d("TS", "wanaparthy", "Wanaparthy", "వనపర్తి", "Wanaparthy", ["wanaparthy", "wanaparthi"]),
  d("TS", "warangal", "Warangal", "వరంగల్", "Warangal", ["warangal", "narsampet"]),
  d("TS", "yadadri-bhuvanagiri", "Yadadri Bhuvanagiri", "యాదాద్రి భువనగిరి", "Bhongir", ["bhongir", "bhuvanagiri", "yadadri", "yadagirigutta", "choutuppal"]),
];

export const DISTRICT_BY_SLUG: Record<string, District> = Object.fromEntries(DISTRICTS.map((x) => [x.slug, x]));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tierRe = (list: Array<{ slug: string; words: string[] }>) =>
  list.flatMap(({ slug, words }) => words.map((w) => ({ slug, re: new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, "i") })));
const LOCALITY_INDEX = tierRe(DISTRICTS.map((x) => ({ slug: x.slug, words: x.localities ?? [] })));
// Longer names first so "west godavari" beats a shorter overlapping alias.
const ALIAS_INDEX = tierRe(DISTRICTS.map((x) => ({ slug: x.slug, words: x.aliases })))
  .sort((a, b) => b.re.source.length - a.re.source.length);

/** Resolve a free-text Indian location ("Gachibowli, Hyderabad", "Vijayawada, AP") to a district slug. */
export function findDistrict(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const { slug, re } of LOCALITY_INDEX) if (re.test(text)) return slug;
  for (const { slug, re } of ALIAS_INDEX) if (re.test(text)) return slug;
  return null;
}

/** "ap" / "Andhra Pradesh" / "TS" / "Telangana" → canonical state name. */
export function stateNameFromCode(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (["ap", "andhra pradesh", "andhra"].includes(s)) return STATE_NAMES.AP.name;
  if (["ts", "tg", "telangana"].includes(s)) return STATE_NAMES.TS.name;
  return null;
}
