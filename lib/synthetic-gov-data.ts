/**
 * Synthetic "government" farmer registry.
 *
 * We are not yet integrated with the real government farmer database, so this
 * module mimics what such a dataset would return. The onboarding flow looks a
 * farmer up here by Farmer ID + phone (after OTP) and pre-fills their profile,
 * instead of asking the farmer to type everything in by hand.
 *
 * Coordinates are small plausible polygons near real Tamil Nadu district
 * centroids so the existing weather (Open-Meteo via land centroid) and
 * district-based crop-suitability logic keep working unchanged.
 *
 * To add a demo farmer: copy a record below, give it a unique TN id + phone,
 * and pick a district centroid. That's it — no DB seeding required.
 */

import { toTenDigitPhone } from './phone';

export interface GovFarmerRecord {
  /** "TN" + 11 digits — matches the existing /^TN\d{11}$/ rule. */
  farmer_id: string;
  /** 10-digit phone the OTP is tied to. */
  phone: string;
  name: string;
  district: string;
  /** Free-text village, district, state. */
  address: string;
  land_area_acres: number;
  /** Land/soil topography description. */
  typography: string;
  /** Polygon (>= 3 points) of the registered land parcel. */
  land_coordinates: { lat: number; lng: number }[];
  preferred_language: 'en' | 'hi' | 'ta';
  /** Government-style fields shown on the confirm screen. */
  survey_number: string;
  aadhaar_masked: string;
  category: string;
}

/** Build a small (~250 m) square parcel polygon around a district centroid. */
function parcel(lat: number, lng: number): { lat: number; lng: number }[] {
  const d = 0.0022; // ~250 m
  return [
    { lat: lat + d, lng: lng - d },
    { lat: lat + d, lng: lng + d },
    { lat: lat - d, lng: lng + d },
    { lat: lat - d, lng: lng - d },
  ];
}

const RECORDS: GovFarmerRecord[] = [
  {
    farmer_id: 'TN10000000001',
    phone: '9876500001',
    name: 'Murugan Vel-Sami',
    district: 'Thanjavur',
    address: 'Pillaiyarpatti, Thanjavur, Tamil Nadu',
    land_area_acres: 2.5,
    typography: 'Cauvery delta alluvial clay, flat and well-irrigated',
    land_coordinates: parcel(10.787, 79.137),
    preferred_language: 'ta',
    survey_number: '142/3B',
    aadhaar_masked: 'XXXX-XXXX-4471',
    category: 'Small / Marginal farmer',
  },
  {
    farmer_id: 'TN10000000002',
    phone: '9876500002',
    name: 'Lakshmi Anbarasan',
    district: 'Erode',
    address: 'Chennimalai, Erode, Tamil Nadu',
    land_area_acres: 1.8,
    typography: 'Red sandy loam, gently sloping, bore-well irrigated',
    land_coordinates: parcel(11.342, 77.728),
    preferred_language: 'ta',
    survey_number: '88/1A',
    aadhaar_masked: 'XXXX-XXXX-2290',
    category: 'Small / Marginal farmer',
  },
  {
    farmer_id: 'TN10000000003',
    phone: '9876500003',
    name: 'Ramesh Karuppaiah',
    district: 'Madurai',
    address: 'Thirumangalam, Madurai, Tamil Nadu',
    land_area_acres: 4.0,
    typography: 'Black cotton soil, level, rain-fed with one bore well',
    land_coordinates: parcel(9.931, 78.121),
    preferred_language: 'ta',
    survey_number: '205/2',
    aadhaar_masked: 'XXXX-XXXX-7813',
    category: 'Semi-medium farmer',
  },
  {
    farmer_id: 'TN10000000004',
    phone: '9876500004',
    name: 'Selvi Manickam',
    district: 'Coimbatore',
    address: 'Pollachi, Coimbatore, Tamil Nadu',
    land_area_acres: 3.2,
    typography: 'Red loam, gently undulating, drip-irrigated',
    land_coordinates: parcel(11.024, 76.961),
    preferred_language: 'en',
    survey_number: '57/4C',
    aadhaar_masked: 'XXXX-XXXX-3340',
    category: 'Semi-medium farmer',
  },
  {
    farmer_id: 'TN10000000005',
    phone: '9876500005',
    name: 'Arjun Pandian',
    district: 'Salem',
    address: 'Attur, Salem, Tamil Nadu',
    land_area_acres: 1.2,
    typography: 'Red loam mixed with gravel, sloping, rain-fed',
    land_coordinates: parcel(11.662, 78.155),
    preferred_language: 'ta',
    survey_number: '19/2A',
    aadhaar_masked: 'XXXX-XXXX-9925',
    category: 'Small / Marginal farmer',
  },
  {
    farmer_id: 'TN10000000006',
    phone: '9876500006',
    name: 'Fathima Begum',
    district: 'Tiruchirappalli',
    address: 'Lalgudi, Tiruchirappalli, Tamil Nadu',
    land_area_acres: 2.0,
    typography: 'Cauvery basin alluvial loam, flat, canal-irrigated',
    land_coordinates: parcel(10.792, 78.704),
    preferred_language: 'ta',
    survey_number: '110/1',
    aadhaar_masked: 'XXXX-XXXX-5567',
    category: 'Small / Marginal farmer',
  },
  {
    farmer_id: 'TN10000000007',
    phone: '9876500007',
    name: 'Vijay Krishnan',
    district: 'Villupuram',
    address: 'Tindivanam, Villupuram, Tamil Nadu',
    land_area_acres: 5.5,
    typography: 'Red ferruginous loam, level, tank and bore-well irrigated',
    land_coordinates: parcel(11.944, 79.491),
    preferred_language: 'en',
    survey_number: '301/6',
    aadhaar_masked: 'XXXX-XXXX-1102',
    category: 'Medium farmer',
  },
  {
    farmer_id: 'TN10000000008',
    phone: '9876500008',
    name: 'Saraswathi Devi',
    district: 'Cuddalore',
    address: 'Chidambaram, Cuddalore, Tamil Nadu',
    land_area_acres: 1.5,
    typography: 'Coastal alluvial sandy clay, flat, canal-irrigated',
    land_coordinates: parcel(11.752, 79.772),
    preferred_language: 'hi',
    survey_number: '76/3',
    aadhaar_masked: 'XXXX-XXXX-8854',
    category: 'Small / Marginal farmer',
  },
];

function normalizeFarmerId(raw: string): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Look a farmer up in the synthetic registry. Both the Farmer ID and phone must
 * match (mirrors how a real lookup would verify identity), so a stranger cannot
 * onboard with only an ID. Returns null when there is no match.
 */
export function getGovFarmerRecord(farmerId: string, phone: string): GovFarmerRecord | null {
  const id = normalizeFarmerId(farmerId);
  const ph = toTenDigitPhone(String(phone ?? ''));
  return RECORDS.find((r) => r.farmer_id === id && r.phone === ph) ?? null;
}

/** Public-facing demo list (id + phone + name) so the login/register UI can hint valid demo accounts. */
export function listDemoFarmers(): { farmer_id: string; phone: string; name: string; district: string }[] {
  return RECORDS.map((r) => ({ farmer_id: r.farmer_id, phone: r.phone, name: r.name, district: r.district }));
}
