export type GeographyNodeLevel = 1 | 2 | 3;

export interface GeographyNode {
  id: string;
  label: string;
  level: GeographyNodeLevel;
  children?: GeographyNode[];
  countryCode?: string;
}

export interface StartupGeography {
  countryCode: string | null;
  level1: string;
  level2: string;
  level3: string;
  path: string[];
  normalizedRegion: string;
}

interface CountryPath {
  level1: string;
  level2: string;
  level3: string;
}

const GLOBAL_LEVEL_1 = "l1:global";
const GLOBAL_LEVEL_2 = "l2:global";
const GLOBAL_LEVEL_3 = "l3:unknown";

export const GEOGRAPHY_TAXONOMY_VERSION = "2026-02-09";

function countryNode(countryCode: string, label: string): GeographyNode {
  return {
    id: `l3:${countryCode.toLowerCase()}`,
    label,
    level: 3,
    countryCode: countryCode.toUpperCase(),
  };
}

const INVESTOR_GEOGRAPHY_TAXONOMY: GeographyNode[] = [
  {
    id: "l1:north_america",
    label: "North America",
    level: 1,
    children: [
      {
        id: "l2:us_canada",
        label: "US & Canada",
        level: 2,
        children: [countryNode("US", "United States"), countryNode("CA", "Canada")],
      },
      {
        id: "l2:caribbean",
        label: "Caribbean",
        level: 2,
        children: [
          countryNode("DO", "Dominican Republic"),
          countryNode("JM", "Jamaica"),
          countryNode("TT", "Trinidad and Tobago"),
          countryNode("BS", "Bahamas"),
        ],
      },
    ],
  },
  {
    id: "l1:europe",
    label: "Europe",
    level: 1,
    children: [
      {
        id: "l2:western_europe",
        label: "Western Europe",
        level: 2,
        children: [
          countryNode("GB", "United Kingdom"),
          countryNode("IE", "Ireland"),
          countryNode("FR", "France"),
          countryNode("DE", "Germany"),
          countryNode("NL", "Netherlands"),
          countryNode("BE", "Belgium"),
          countryNode("CH", "Switzerland"),
          countryNode("AT", "Austria"),
          countryNode("LU", "Luxembourg"),
        ],
      },
      {
        id: "l2:southern_europe",
        label: "Southern Europe",
        level: 2,
        children: [
          countryNode("ES", "Spain"),
          countryNode("IT", "Italy"),
          countryNode("PT", "Portugal"),
          countryNode("GR", "Greece"),
          countryNode("MT", "Malta"),
          countryNode("CY", "Cyprus"),
        ],
      },
      {
        id: "l2:northern_europe",
        label: "Northern Europe",
        level: 2,
        children: [
          countryNode("SE", "Sweden"),
          countryNode("NO", "Norway"),
          countryNode("DK", "Denmark"),
          countryNode("FI", "Finland"),
          countryNode("IS", "Iceland"),
        ],
      },
      {
        id: "l2:central_eastern_europe",
        label: "Central & Eastern Europe",
        level: 2,
        children: [
          countryNode("PL", "Poland"),
          countryNode("CZ", "Czechia"),
          countryNode("RO", "Romania"),
          countryNode("HU", "Hungary"),
          countryNode("BG", "Bulgaria"),
          countryNode("HR", "Croatia"),
          countryNode("RS", "Serbia"),
          countryNode("SK", "Slovakia"),
          countryNode("SI", "Slovenia"),
          countryNode("EE", "Estonia"),
          countryNode("LV", "Latvia"),
          countryNode("LT", "Lithuania"),
          countryNode("UA", "Ukraine"),
        ],
      },
    ],
  },
  {
    id: "l1:mena",
    label: "MENA",
    level: 1,
    children: [
      {
        id: "l2:gcc",
        label: "GCC",
        level: 2,
        children: [
          countryNode("AE", "UAE"),
          countryNode("SA", "Saudi Arabia"),
          countryNode("QA", "Qatar"),
          countryNode("KW", "Kuwait"),
          countryNode("BH", "Bahrain"),
          countryNode("OM", "Oman"),
        ],
      },
      {
        id: "l2:non_gcc_mena",
        label: "Non-GCC MENA",
        level: 2,
        children: [
          countryNode("EG", "Egypt"),
          countryNode("JO", "Jordan"),
          countryNode("LB", "Lebanon"),
          countryNode("IQ", "Iraq"),
          countryNode("MA", "Morocco"),
          countryNode("TN", "Tunisia"),
          countryNode("DZ", "Algeria"),
          countryNode("LY", "Libya"),
          countryNode("TR", "Turkey"),
        ],
      },
    ],
  },
  {
    id: "l1:south_asia",
    label: "South Asia",
    level: 1,
    children: [
      {
        id: "l2:india",
        label: "India",
        level: 2,
        children: [countryNode("IN", "India")],
      },
      {
        id: "l2:non_india_south_asia",
        label: "Non-India South Asia",
        level: 2,
        children: [
          countryNode("PK", "Pakistan"),
          countryNode("BD", "Bangladesh"),
          countryNode("LK", "Sri Lanka"),
          countryNode("NP", "Nepal"),
        ],
      },
    ],
  },
  {
    id: "l1:southeast_asia",
    label: "Southeast Asia",
    level: 1,
    children: [
      {
        id: "l2:asean_core",
        label: "ASEAN Core",
        level: 2,
        children: [
          countryNode("SG", "Singapore"),
          countryNode("ID", "Indonesia"),
          countryNode("MY", "Malaysia"),
          countryNode("TH", "Thailand"),
          countryNode("VN", "Vietnam"),
          countryNode("PH", "Philippines"),
        ],
      },
      {
        id: "l2:frontier_sea",
        label: "Frontier SEA",
        level: 2,
        children: [
          countryNode("KH", "Cambodia"),
          countryNode("LA", "Laos"),
          countryNode("MM", "Myanmar"),
          countryNode("BN", "Brunei"),
        ],
      },
    ],
  },
  {
    id: "l1:east_asia",
    label: "East Asia",
    level: 1,
    children: [
      {
        id: "l2:greater_china",
        label: "Greater China",
        level: 2,
        children: [
          countryNode("CN", "China"),
          countryNode("HK", "Hong Kong"),
          countryNode("TW", "Taiwan"),
        ],
      },
      {
        id: "l2:northeast_asia",
        label: "Northeast Asia",
        level: 2,
        children: [
          countryNode("JP", "Japan"),
          countryNode("KR", "South Korea"),
          countryNode("MN", "Mongolia"),
        ],
      },
    ],
  },
  {
    id: "l1:africa",
    label: "Africa",
    level: 1,
    children: [
      {
        id: "l2:west_africa",
        label: "West Africa",
        level: 2,
        children: [
          countryNode("NG", "Nigeria"),
          countryNode("GH", "Ghana"),
          countryNode("CI", "Cote d'Ivoire"),
          countryNode("SN", "Senegal"),
        ],
      },
      {
        id: "l2:east_africa",
        label: "East Africa",
        level: 2,
        children: [
          countryNode("KE", "Kenya"),
          countryNode("TZ", "Tanzania"),
          countryNode("UG", "Uganda"),
          countryNode("RW", "Rwanda"),
          countryNode("ET", "Ethiopia"),
        ],
      },
      {
        id: "l2:southern_africa",
        label: "Southern Africa",
        level: 2,
        children: [
          countryNode("ZA", "South Africa"),
          countryNode("BW", "Botswana"),
          countryNode("NA", "Namibia"),
          countryNode("ZM", "Zambia"),
          countryNode("ZW", "Zimbabwe"),
          countryNode("MZ", "Mozambique"),
        ],
      },
    ],
  },
  {
    id: "l1:latin_america",
    label: "Latin America",
    level: 1,
    children: [
      {
        id: "l2:brazil_southern_cone",
        label: "Brazil & Southern Cone",
        level: 2,
        children: [
          countryNode("BR", "Brazil"),
          countryNode("AR", "Argentina"),
          countryNode("CL", "Chile"),
          countryNode("UY", "Uruguay"),
          countryNode("PY", "Paraguay"),
        ],
      },
      {
        id: "l2:andean_mexico",
        label: "Andean Region & Mexico",
        level: 2,
        children: [
          countryNode("MX", "Mexico"),
          countryNode("CO", "Colombia"),
          countryNode("PE", "Peru"),
          countryNode("EC", "Ecuador"),
          countryNode("BO", "Bolivia"),
        ],
      },
      {
        id: "l2:central_america_caribbean",
        label: "Central America & Caribbean",
        level: 2,
        children: [
          countryNode("CR", "Costa Rica"),
          countryNode("PA", "Panama"),
          countryNode("GT", "Guatemala"),
        ],
      },
    ],
  },
];

interface GeographyFlatNode {
  id: string;
  label: string;
  level: GeographyNodeLevel;
  parentId: string | null;
  countryCode: string | null;
}

const geographyNodeById = new Map<string, GeographyFlatNode>();
const countryPathByCode = new Map<string, CountryPath>();

function flatten(nodes: GeographyNode[], parentId: string | null): void {
  for (const node of nodes) {
    geographyNodeById.set(node.id, {
      id: node.id,
      label: node.label,
      level: node.level,
      parentId,
      countryCode: node.countryCode ?? null,
    });

    if (node.countryCode && parentId) {
      const level2Id = parentId;
      const level1Node = geographyNodeById.get(level2Id);
      if (level1Node?.parentId) {
        countryPathByCode.set(node.countryCode, {
          level1: level1Node.parentId,
          level2: level2Id,
          level3: node.id,
        });
      }
    }

    if (node.children?.length) {
      flatten(node.children, node.id);
    }
  }
}

flatten(INVESTOR_GEOGRAPHY_TAXONOMY, null);

const validNodeIds = new Set<string>(geographyNodeById.keys());

const LEGACY_LABEL_TO_NODE_IDS: Record<string, string[]> = {
  "north america": ["l1:north_america"],
  europe: ["l1:europe"],
  mena: ["l1:mena"],
  "middle east": ["l1:mena"],
  gcc: ["l2:gcc"],
  "non-gcc mena": ["l2:non_gcc_mena"],
  "south asia": ["l1:south_asia"],
  "southeast asia": ["l1:southeast_asia"],
  "east asia": ["l1:east_asia"],
  africa: ["l1:africa"],
  "latin america": ["l1:latin_america"],
  latam: ["l1:latin_america"],
  asia: ["l1:south_asia", "l1:southeast_asia", "l1:east_asia"],
  "asia pacific": ["l1:south_asia", "l1:southeast_asia", "l1:east_asia"],
  apac: ["l1:south_asia", "l1:southeast_asia", "l1:east_asia"],
  us: ["l3:us"],
  usa: ["l3:us"],
  "united states": ["l3:us"],
  global: [GLOBAL_LEVEL_1],
};

const REGION_TO_NORMALIZED_REGION: Record<string, string> = {
  "l1:north_america": "us",
  "l1:europe": "europe",
  "l1:mena": "mena",
  "l1:south_asia": "asia",
  "l1:southeast_asia": "asia",
  "l1:east_asia": "asia",
  "l1:latin_america": "latam",
  "l1:africa": "global",
  [GLOBAL_LEVEL_1]: "global",
};

const COUNTRY_ALIASES: Array<[string, string]> = [
  ["united states", "US"],
  ["usa", "US"],
  ["u s a", "US"],
  ["canada", "CA"],
  ["united kingdom", "GB"],
  ["uk", "GB"],
  ["england", "GB"],
  ["ireland", "IE"],
  ["france", "FR"],
  ["germany", "DE"],
  ["netherlands", "NL"],
  ["spain", "ES"],
  ["italy", "IT"],
  ["portugal", "PT"],
  ["sweden", "SE"],
  ["norway", "NO"],
  ["denmark", "DK"],
  ["finland", "FI"],
  ["poland", "PL"],
  ["romania", "RO"],
  ["ukraine", "UA"],
  ["switzerland", "CH"],
  ["austria", "AT"],
  ["united arab emirates", "AE"],
  ["uae", "AE"],
  ["saudi arabia", "SA"],
  ["qatar", "QA"],
  ["kuwait", "KW"],
  ["bahrain", "BH"],
  ["oman", "OM"],
  ["egypt", "EG"],
  ["jordan", "JO"],
  ["lebanon", "LB"],
  ["iraq", "IQ"],
  ["morocco", "MA"],
  ["tunisia", "TN"],
  ["algeria", "DZ"],
  ["libya", "LY"],
  ["turkey", "TR"],
  ["india", "IN"],
  ["pakistan", "PK"],
  ["bangladesh", "BD"],
  ["sri lanka", "LK"],
  ["nepal", "NP"],
  ["singapore", "SG"],
  ["indonesia", "ID"],
  ["malaysia", "MY"],
  ["thailand", "TH"],
  ["vietnam", "VN"],
  ["philippines", "PH"],
  ["cambodia", "KH"],
  ["laos", "LA"],
  ["myanmar", "MM"],
  ["brunei", "BN"],
  ["china", "CN"],
  ["hong kong", "HK"],
  ["taiwan", "TW"],
  ["japan", "JP"],
  ["south korea", "KR"],
  ["mongolia", "MN"],
  ["nigeria", "NG"],
  ["ghana", "GH"],
  ["kenya", "KE"],
  ["tanzania", "TZ"],
  ["uganda", "UG"],
  ["rwanda", "RW"],
  ["ethiopia", "ET"],
  ["south africa", "ZA"],
  ["brazil", "BR"],
  ["argentina", "AR"],
  ["chile", "CL"],
  ["uruguay", "UY"],
  ["paraguay", "PY"],
  ["mexico", "MX"],
  ["colombia", "CO"],
  ["peru", "PE"],
  ["ecuador", "EC"],
  ["bolivia", "BO"],
  ["costa rica", "CR"],
  ["panama", "PA"],
  ["guatemala", "GT"],
  ["dominican republic", "DO"],
];

const CITY_ALIASES: Array<[string, string]> = [
  ["san francisco", "US"],
  ["new york", "US"],
  ["los angeles", "US"],
  ["austin", "US"],
  ["boston", "US"],
  ["seattle", "US"],
  ["miami", "US"],
  ["toronto", "CA"],
  ["vancouver", "CA"],
  ["london", "GB"],
  ["paris", "FR"],
  ["berlin", "DE"],
  ["amsterdam", "NL"],
  ["madrid", "ES"],
  ["rome", "IT"],
  ["dublin", "IE"],
  ["stockholm", "SE"],
  ["dubai", "AE"],
  ["abu dhabi", "AE"],
  ["riyadh", "SA"],
  ["jeddah", "SA"],
  ["doha", "QA"],
  ["kuwait city", "KW"],
  ["manama", "BH"],
  ["muscat", "OM"],
  ["cairo", "EG"],
  ["amman", "JO"],
  ["beirut", "LB"],
  ["casablanca", "MA"],
  ["mumbai", "IN"],
  ["bengaluru", "IN"],
  ["bangalore", "IN"],
  ["delhi", "IN"],
  ["karachi", "PK"],
  ["dhaka", "BD"],
  ["colombo", "LK"],
  ["singapore", "SG"],
  ["jakarta", "ID"],
  ["kuala lumpur", "MY"],
  ["bangkok", "TH"],
  ["ho chi minh", "VN"],
  ["hanoi", "VN"],
  ["manila", "PH"],
  ["beijing", "CN"],
  ["shanghai", "CN"],
  ["shenzhen", "CN"],
  ["hong kong", "HK"],
  ["taipei", "TW"],
  ["tokyo", "JP"],
  ["seoul", "KR"],
  ["lagos", "NG"],
  ["nairobi", "KE"],
  ["cape town", "ZA"],
  ["johannesburg", "ZA"],
  ["sao paulo", "BR"],
  ["rio de janeiro", "BR"],
  ["mexico city", "MX"],
  ["bogota", "CO"],
  ["buenos aires", "AR"],
  ["santiago", "CL"],
  ["lima", "PE"],
];

const ISO2_COUNTRY_CODES = new Set<string>(countryPathByCode.keys());

const COUNTRY_ALIASES_SORTED = [...COUNTRY_ALIASES].sort(
  (a, b) => b[0].length - a[0].length,
);
const CITY_ALIASES_SORTED = [...CITY_ALIASES].sort(
  (a, b) => b[0].length - a[0].length,
);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(phrase)}($|\\s)`);
  return pattern.test(haystack);
}

function resolveCountryFromLocation(location: string): string | null {
  const normalized = normalizeText(location);
  if (!normalized) {
    return null;
  }

  for (const [alias, code] of COUNTRY_ALIASES_SORTED) {
    if (containsPhrase(normalized, alias)) {
      return code;
    }
  }

  for (const [alias, code] of CITY_ALIASES_SORTED) {
    if (containsPhrase(normalized, alias)) {
      return code;
    }
  }

  const tokenMatches = normalized.match(/\b[a-z]{2}\b/g) ?? [];
  for (const token of tokenMatches) {
    const upper = token.toUpperCase();
    if (ISO2_COUNTRY_CODES.has(upper)) {
      return upper;
    }
  }

  return null;
}

function fallbackGeography(): StartupGeography {
  return {
    countryCode: null,
    level1: GLOBAL_LEVEL_1,
    level2: GLOBAL_LEVEL_2,
    level3: GLOBAL_LEVEL_3,
    path: [GLOBAL_LEVEL_1, GLOBAL_LEVEL_2, GLOBAL_LEVEL_3],
    normalizedRegion: "global",
  };
}

export function getInvestorGeographyTaxonomy(): GeographyNode[] {
  return INVESTOR_GEOGRAPHY_TAXONOMY;
}

export function getGeographyNodeLabel(id: string): string | null {
  return geographyNodeById.get(id)?.label ?? null;
}

export function isValidGeographyNodeId(id: string): boolean {
  if (id === GLOBAL_LEVEL_1) {
    return true;
  }

  return validNodeIds.has(id.trim().toLowerCase());
}

export function mapLegacyGeographicFocusToNodeIds(values: string[] | null | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  const mapped: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) {
      continue;
    }

    const nodeIds = LEGACY_LABEL_TO_NODE_IDS[normalized];
    if (!nodeIds) {
      continue;
    }

    mapped.push(...nodeIds);
  }

  return mapped;
}

export function canonicalizeGeographicFocus(input: {
  geographicFocusNodes?: string[] | null;
  geographicFocus?: string[] | null;
}): string[] {
  const merged = new Set<string>();

  const explicitNodes = input.geographicFocusNodes ?? [];
  for (const node of explicitNodes) {
    const normalized = node.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    if (isValidGeographyNodeId(normalized)) {
      merged.add(normalized);
      continue;
    }

    const legacyMapped = mapLegacyGeographicFocusToNodeIds([normalized]);
    for (const mapped of legacyMapped) {
      if (isValidGeographyNodeId(mapped)) {
        merged.add(mapped);
      }
    }
  }

  const fromLegacy = mapLegacyGeographicFocusToNodeIds(input.geographicFocus);
  for (const mapped of fromLegacy) {
    if (isValidGeographyNodeId(mapped)) {
      merged.add(mapped);
    }
  }

  return Array.from(merged);
}

export function mapNodeIdsToLabels(nodeIds: string[]): string[] {
  const labels = new Set<string>();

  for (const nodeId of nodeIds) {
    const id = nodeId.trim().toLowerCase();
    if (!id) {
      continue;
    }

    if (id === GLOBAL_LEVEL_1) {
      labels.add("Global");
      continue;
    }

    const label = getGeographyNodeLabel(id);
    if (label) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}

export function deriveStartupGeography(location: string): StartupGeography {
  const resolvedCountry = resolveCountryFromLocation(location);

  if (!resolvedCountry) {
    return fallbackGeography();
  }

  const path = countryPathByCode.get(resolvedCountry);
  if (!path) {
    return fallbackGeography();
  }

  return {
    countryCode: resolvedCountry,
    level1: path.level1,
    level2: path.level2,
    level3: path.level3,
    path: [path.level1, path.level2, path.level3],
    normalizedRegion: REGION_TO_NORMALIZED_REGION[path.level1] ?? "global",
  };
}

export function geographySelectionMatchesStartupPath(
  geographicFocusNodes: string[] | null | undefined,
  startupPath: string[] | null | undefined,
): boolean {
  const selected = canonicalizeGeographicFocus({ geographicFocusNodes });

  if (selected.length === 0) {
    return true;
  }

  const pathSet = new Set((startupPath ?? []).map((value) => value.trim().toLowerCase()));

  for (const nodeId of selected) {
    if (nodeId === GLOBAL_LEVEL_1) {
      return true;
    }

    if (pathSet.has(nodeId)) {
      return true;
    }
  }

  return false;
}

export function normalizeStartupPathFromLocation(location: string): string[] {
  const geography = deriveStartupGeography(location);
  return geography.path;
}

export const INVESTOR_GEOGRAPHY_LEVEL1 = INVESTOR_GEOGRAPHY_TAXONOMY.map((node) => node.id);
export const GLOBAL_GEOGRAPHY_NODE = GLOBAL_LEVEL_1;
