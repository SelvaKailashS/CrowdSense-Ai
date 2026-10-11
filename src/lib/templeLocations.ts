export interface TempleBoardingStop {
  name: string;
  coords: [number, number]; // [lng, lat]
  description?: string;
}

export interface TempleLocation {
  id: string;
  name: string;
  town: string;
  district: string;
  coords: [number, number]; // [longitude, latitude]
  description: string;
  depot: {
    name: string;
    coords: [number, number];
  };
  stops: TempleBoardingStop[];
}

export const TAMIL_NADU_TEMPLES: TempleLocation[] = [
  {
    id: "mallur-mariamman",
    name: "Mallur Sri Mariamman Temple",
    town: "Mallur",
    district: "Salem",
    coords: [78.1825, 11.5440],
    description: "Annual Panguni/Chithirai Car Festival Grounds, Salem District",
    depot: {
      name: "TNSTC Salem-Mallur Central Fleet Depot",
      coords: [78.1750, 11.5540],
    },
    stops: [
      {
        name: "Mallur Main Bus Stand",
        coords: [78.1805, 11.5410],
        description: "Central town boarding terminal and passenger concourse",
      },
      {
        name: "Mariamman Car Street Stop",
        coords: [78.1895, 11.5475],
        description: "Temple perimeter pedestrian entry and festival chariot path",
      },
      {
        name: "Salem-Namakkal Highway Park & Ride",
        coords: [78.1735, 11.5340],
        description: "NH-44 arterial feeder stop with dedicated bus turnaround",
      },
    ],
  },
  {
    id: "meenakshi-amman",
    name: "Madurai Meenakshi Amman Temple",
    town: "Madurai",
    district: "Madurai",
    coords: [78.1193, 9.9195],
    description: "Chithirai Festival, Vaigai River Festival & Masi Streets Transit Zone",
    depot: {
      name: "TNSTC Madurai Bypass Depot (Ellis Nagar)",
      coords: [78.1080, 9.9280],
    },
    stops: [
      {
        name: "Periyar Bus Stand (Terminal 1)",
        coords: [78.1130, 9.9160],
        description: "Primary city bus terminal connecting central railway and town routes",
      },
      {
        name: "South Masi Street / Chitra Car Gate",
        coords: [78.1250, 9.9170],
        description: "East and South Tower devotee queue entry & festival chariot street",
      },
      {
        name: "Arapalayam Transit Terminal",
        coords: [78.1060, 9.9320],
        description: "Inter-district highway terminal for Dindigul and Theni arrivals",
      },
    ],
  },
  {
    id: "kapaleeshwarar",
    name: "Kapaleeshwarar Temple, Mylapore",
    town: "Chennai",
    district: "Chennai",
    coords: [80.2698, 13.0336],
    description: "Panguni Peruvizha, Mylapore Tank & R.K. Mutt Road Concourse",
    depot: {
      name: "MTC Mandaveli Bus Depot & Terminus",
      coords: [80.2630, 13.0270],
    },
    stops: [
      {
        name: "Mylapore Tank (R.K. Mutt Road)",
        coords: [80.2685, 13.0345],
        description: "Direct temple tank front bus concourse and pedestrian zone",
      },
      {
        name: "Luz Corner Junction Terminal",
        coords: [80.2650, 13.0380],
        description: "High-frequency MTC transit interchange connecting Royapettah",
      },
      {
        name: "Mandaveli MRTS Station Concourse",
        coords: [80.2615, 13.0260],
        description: "Suburban rail and bus feeder interchange point",
      },
    ],
  },
  {
    id: "brihadeeswarar",
    name: "Brihadeeswarar Temple (Thanjavur Periya Kovil)",
    town: "Thanjavur",
    district: "Thanjavur",
    coords: [79.1318, 10.7828],
    description: "Rajarajan Thirunaal & Chithirai Ther Thiruvizha Corridor",
    depot: {
      name: "TNSTC Thanjavur Old Bus Stand Depot",
      coords: [79.1380, 10.7890],
    },
    stops: [
      {
        name: "Old Bus Stand Terminal (Sivaji Nagar)",
        coords: [79.1370, 10.7860],
        description: "Town center transit terminus 1km east of the Great Temple",
      },
      {
        name: "Sivaganga Park & Moat Feeder Bay",
        coords: [79.1305, 10.7845],
        description: "Devotee pedestrian plaza directly outside the main gopuram arch",
      },
      {
        name: "New Bus Stand (Trichy Road Interchange)",
        coords: [79.1120, 10.7650],
        description: "Long-distance regional transit and Park & Ride hub",
      },
    ],
  },
  {
    id: "annamalaiyar",
    name: "Arulmigu Annamalaiyar Temple",
    town: "Tiruvannamalai",
    district: "Tiruvannamalai",
    coords: [79.0677, 12.2319],
    description: "Karthigai Deepam Maha Thiruvizha (Girivalam 14km Outflow Network)",
    depot: {
      name: "TNSTC Tiruvannamalai Central Depot",
      coords: [79.0550, 12.2420],
    },
    stops: [
      {
        name: "Tiruvannamalai Central Bus Stand",
        coords: [79.0730, 12.2280],
        description: "Central bus terminus for Vellore, Chennai, and Villupuram lines",
      },
      {
        name: "Girivalam Path Entry (Eswanya Lingam)",
        coords: [79.0710, 12.2390],
        description: "Primary assembly node for the 14km sacred Girivalam circumambulation",
      },
      {
        name: "Tindivanam Road Temporary Bus Stand",
        coords: [79.0850, 12.2240],
        description: "Special Karthigai Deepam festival bypass shuttle station",
      },
    ],
  },
  {
    id: "palani-murugan",
    name: "Palani Arulmigu Dhandayuthapani Swamy Temple",
    town: "Palani",
    district: "Dindigul",
    coords: [77.5147, 10.4496],
    description: "Thaipusam Mass Footfall, Adivaram Giriveethi Transit Hub",
    depot: {
      name: "TNSTC Palani Bus Depot (Dindigul Road)",
      coords: [77.5250, 10.4570],
    },
    stops: [
      {
        name: "Palani Town Bus Stand",
        coords: [77.5190, 10.4530],
        description: "Main municipal transit station for suburban and mofussil buses",
      },
      {
        name: "Adivaram Hill Foot Winch Station",
        coords: [77.5135, 10.4475],
        description: "Hill base winch and ropeway assembly gate for uphill pilgrims",
      },
      {
        name: "Kodaikanal Ghat Road Feeder Terminal",
        coords: [77.5080, 10.4420],
        description: "Outskirt parking and feeder bay for southern pilgrim vehicles",
      },
    ],
  },
  {
    id: "samayapuram",
    name: "Samayapuram Arulmigu Mariamman Temple",
    town: "Samayapuram",
    district: "Tiruchirappalli",
    coords: [78.7397, 10.9254],
    description: "Poochorithal & Chithirai Car Festival Highway Outflow Hub",
    depot: {
      name: "TNSTC Samayapuram Depot (Trichy-Chennai NH-45)",
      coords: [78.7480, 10.9320],
    },
    stops: [
      {
        name: "Samayapuram Toll Plaza Bus Bay",
        coords: [78.7450, 10.9220],
        description: "NH-45 highway rapid boarding and bypass shuttle bay",
      },
      {
        name: "South Car Street Temple Terminal",
        coords: [78.7385, 10.9265],
        description: "Immediate temple entrance and chariot processional street",
      },
      {
        name: "No. 1 Tollgate Junction (Trichy Feeder)",
        coords: [78.7210, 10.8850],
        description: "Coleroon River bridge junction linking Trichy city to Samayapuram",
      },
    ],
  },
  {
    id: "srirangam",
    name: "Sri Ranganathaswamy Temple, Srirangam",
    town: "Srirangam",
    district: "Tiruchirappalli",
    coords: [78.6897, 10.8624],
    description: "Vaikunta Ekadasi 21-Day Mass Gathering Transit Zone",
    depot: {
      name: "TNSTC Srirangam Depot (Mela Chithirai Street)",
      coords: [78.6820, 10.8710],
    },
    stops: [
      {
        name: "Srirangam Rajagopuram Terminal",
        coords: [78.6910, 10.8590],
        description: "Grand 73-meter southern tower entrance and pilgrim transit concourse",
      },
      {
        name: "Gandhi Road Bus Stand",
        coords: [78.6940, 10.8570],
        description: "High-capacity mofussil bus stand connecting to Trichy Junction",
      },
      {
        name: "Cauvery Bridge Northern Feeder Bay",
        coords: [78.6960, 10.8490],
        description: "River bridge approach for shuttle services between Trichy and Srirangam",
      },
    ],
  },
  {
    id: "ramanathaswamy",
    name: "Ramanathaswamy Temple",
    town: "Rameswaram",
    district: "Ramanathapuram",
    coords: [79.3174, 9.2881],
    description: "Mahashivratri & Agnitheertham Pilgrim Congregation",
    depot: {
      name: "TNSTC Rameswaram Island Depot",
      coords: [79.3080, 9.2920],
    },
    stops: [
      {
        name: "Rameswaram Municipal Bus Stand",
        coords: [79.3110, 9.2860],
        description: "Central bus station linking the Pamban rail bridge & mainland buses",
      },
      {
        name: "Agnitheertham Seafront Gate",
        coords: [79.3210, 9.2885],
        description: "Sacred sea bath shore concourse and East Gopuram entrance",
      },
      {
        name: "Dhanushkodi Feeder Point (Mukundarayar Chathiram)",
        coords: [79.3390, 9.2550],
        description: "Assembly terminal for south island eco-shuttles and state buses",
      },
    ],
  },
  {
    id: "tiruchendur",
    name: "Tiruchendur Subramanya Swamy Temple",
    town: "Tiruchendur",
    district: "Thoothukudi",
    coords: [78.1287, 8.4962],
    description: "Soorasamharam Seafront Festival Transit Concourse",
    depot: {
      name: "TNSTC Tiruchendur Depot",
      coords: [78.1180, 8.5030],
    },
    stops: [
      {
        name: "Tiruchendur Bus Stand (Town Central)",
        coords: [78.1220, 8.4980],
        description: "Main government transit hub with express routes to Tirunelveli and Madurai",
      },
      {
        name: "Temple Beach Road Terminal",
        coords: [78.1275, 8.4950],
        description: "Devotee pedestrian gateway facing the seashore sanctum",
      },
      {
        name: "Tuticorin Highway Feeder Bay",
        coords: [78.1150, 8.5120],
        description: "Northern bypass intersection for festival crowd Park & Ride",
      },
    ],
  },
  {
    id: "nellaiappar",
    name: "Nellaiappar Temple",
    town: "Tirunelveli",
    district: "Tirunelveli",
    coords: [77.6974, 8.7289],
    description: "Aani Car Festival & Swami Nellaiyappar Ratham Zone",
    depot: {
      name: "TNSTC Tirunelveli Town Depot",
      coords: [77.6890, 8.7360],
    },
    stops: [
      {
        name: "Tirunelveli Town Bus Stand",
        coords: [77.6940, 8.7270],
        description: "Historic town terminal directly serving four car streets of Nellaiappar",
      },
      {
        name: "North Car Street Procession Gate",
        coords: [77.6980, 8.7315],
        description: "Grand wooden car staging area and major devotee queue gate",
      },
      {
        name: "Vannarpettai Junction Interchange",
        coords: [77.7120, 8.7250],
        description: "Major Thamirabarani river crossing linking Junction & Town terminals",
      },
    ],
  },
  {
    id: "kamakshi-amman",
    name: "Kanchi Kamakshi Amman Temple",
    town: "Kanchipuram",
    district: "Kanchipuram",
    coords: [79.7037, 12.8398],
    description: "Brahmotsavam & Maasi Festival Congregation",
    depot: {
      name: "TNSTC Kanchipuram Regional Depot",
      coords: [79.6940, 12.8480],
    },
    stops: [
      {
        name: "Kanchipuram Central Bus Stand",
        coords: [79.7080, 12.8360],
        description: "Mofussil bus terminus serving pilgrims from Chennai, Vellore, and Tirupati",
      },
      {
        name: "East Sannathi Street Terminal",
        coords: [79.7045, 12.8405],
        description: "Temple gate pedestrian zone and chariot festival assembly point",
      },
      {
        name: "Chengalpattu Highway Bypass Stop",
        coords: [79.7190, 12.8290],
        description: "Feeder interchange for southern Tamil Nadu highway buses",
      },
    ],
  },
];

// Fuzzy search matching query against name, town, or district
export function searchTemples(query: string): TempleLocation[] {
  if (!query || query.trim() === "") return TAMIL_NADU_TEMPLES;
  const q = query.toLowerCase().trim();
  return TAMIL_NADU_TEMPLES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.town.toLowerCase().includes(q) ||
      t.district.toLowerCase().includes(q)
  );
}

// Live geocode fallback via OpenStreetMap Nominatim for arbitrary temples in Tamil Nadu
export async function geocodeTempleOnline(query: string): Promise<TempleLocation | null> {
  try {
    const searchQuery = `${query}, Tamil Nadu, India`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
      {
        headers: {
          "Accept-Language": "en",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      const item = data[0];
      return {
        id: `online-${Date.now()}`,
        name: query,
        town: item.address?.town || item.address?.city || item.address?.county || "Tamil Nadu",
        district: item.address?.state_district || "Tamil Nadu",
        coords: [parseFloat(item.lon), parseFloat(item.lat)],
        description: item.display_name,
      };
    }
  } catch (err) {
    console.warn("Online geocoding failed", err);
  }
  return null;
}
