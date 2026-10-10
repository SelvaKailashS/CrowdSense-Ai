// Curated Tamil Nadu Temple Registry with High-Precision Coordinates

export interface TempleLocation {
  id: string;
  name: string;
  town: string;
  district: string;
  coords: [number, number]; // [longitude, latitude]
  description: string;
}

export const TAMIL_NADU_TEMPLES: TempleLocation[] = [
  {
    id: "mallur-mariamman",
    name: "Mallur Sri Mariamman Temple",
    town: "Mallur",
    district: "Salem",
    coords: [78.1825, 11.5440],
    description: "Annual Panguni/Chithirai Car Festival Grounds, Salem District",
  },
  {
    id: "meenakshi-amman",
    name: "Madurai Meenakshi Amman Temple",
    town: "Madurai",
    district: "Madurai",
    coords: [78.1193, 9.9195],
    description: "Chithirai Festival, Vaigai River Festival & Masi Streets Transit Zone",
  },
  {
    id: "kapaleeshwarar",
    name: "Kapaleeshwarar Temple, Mylapore",
    town: "Chennai",
    district: "Chennai",
    coords: [80.2698, 13.0336],
    description: "Panguni Peruvizha, Mylapore Tank & R.K. Mutt Road Concourse",
  },
  {
    id: "brihadeeswarar",
    name: "Brihadeeswarar Temple (Thanjavur Periya Kovil)",
    town: "Thanjavur",
    district: "Thanjavur",
    coords: [79.1318, 10.7828],
    description: "Rajarajan Thirunaal & Chithirai Ther Thiruvizha Corridor",
  },
  {
    id: "annamalaiyar",
    name: "Arulmigu Annamalaiyar Temple",
    town: "Tiruvannamalai",
    district: "Tiruvannamalai",
    coords: [79.0677, 12.2319],
    description: "Karthigai Deepam Maha Thiruvizha (Girivalam 14km Outflow Network)",
  },
  {
    id: "palani-murugan",
    name: "Palani Arulmigu Dhandayuthapani Swamy Temple",
    town: "Palani",
    district: "Dindigul",
    coords: [77.5147, 10.4496],
    description: "Thaipusam Mass Footfall, Adivaram Giriveethi Transit Hub",
  },
  {
    id: "samayapuram",
    name: "Samayapuram Arulmigu Mariamman Temple",
    town: "Samayapuram",
    district: "Tiruchirappalli",
    coords: [78.7397, 10.9254],
    description: "Poochorithal & Chithirai Car Festival Highway Outflow Hub",
  },
  {
    id: "srirangam",
    name: "Sri Ranganathaswamy Temple, Srirangam",
    town: "Srirangam",
    district: "Tiruchirappalli",
    coords: [78.6897, 10.8624],
    description: "Vaikunta Ekadasi 21-Day Mass Gathering Transit Zone",
  },
  {
    id: "ramanathaswamy",
    name: "Ramanathaswamy Temple",
    town: "Rameswaram",
    district: "Ramanathapuram",
    coords: [79.3174, 9.2881],
    description: "Mahashivratri & Agnitheertham Pilgrim Congregation",
  },
  {
    id: "tiruchendur",
    name: "Tiruchendur Subramanya Swamy Temple",
    town: "Tiruchendur",
    district: "Thoothukudi",
    coords: [78.1287, 8.4962],
    description: "Soorasamharam Seafront Festival Transit Concourse",
  },
  {
    id: "nellaiappar",
    name: "Nellaiappar Temple",
    town: "Tirunelveli",
    district: "Tirunelveli",
    coords: [77.6974, 8.7289],
    description: "Aani Car Festival & Swami Nellaiyappar Ratham Zone",
  },
  {
    id: "kamakshi-amman",
    name: "Kanchi Kamakshi Amman Temple",
    town: "Kanchipuram",
    district: "Kanchipuram",
    coords: [79.7037, 12.8398],
    description: "Brahmotsavam & Maasi Festival Congregation",
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
