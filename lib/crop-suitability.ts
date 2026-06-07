import { getAllCropInfos, type CropInfo } from '@/lib/crop-info';

export interface SoilSnapshot {
  ph?: number | string | null;
  nitrogen?: string | null;
  phosphorus?: string | null;
  potassium?: string | null;
  organicCarbon?: string | null;
}

export interface CropSuitability {
  cropName: string;
  score: number;
  reason: string;
  districtMatch: boolean;
  soilFit: 'good' | 'conditional' | 'poor';
}

const DISTRICT_CROPS: Record<string, string[]> = {
  thiruvannamalai: ['Paddy', 'Sugarcane', 'Groundnut', 'Millets', 'Black gram', 'Green gram', 'Sesame'],
  tiruvannamalai: ['Paddy', 'Sugarcane', 'Groundnut', 'Millets', 'Black gram', 'Green gram', 'Sesame'],
  thanjavur: ['Paddy', 'Black gram', 'Green gram', 'Sesame', 'Banana'],
  tiruchirappalli: ['Paddy', 'Banana', 'Sugarcane', 'Groundnut', 'Millets'],
  madurai: ['Paddy', 'Cotton', 'Millets', 'Tomato', 'Brinjal', 'Chilli'],
  erode: ['Turmeric', 'Banana', 'Sugarcane', 'Paddy', 'Groundnut'],
  coimbatore: ['Maize', 'Cotton', 'Tomato', 'Banana', 'Groundnut'],
  salem: ['Paddy', 'Sugarcane', 'Turmeric', 'Groundnut', 'Millets'],
  villupuram: ['Paddy', 'Sugarcane', 'Groundnut', 'Black gram', 'Green gram'],
  cuddalore: ['Paddy', 'Sugarcane', 'Black gram', 'Green gram', 'Groundnut'],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

export function districtFromAddress(address?: string | null) {
  const text = normalize(address ?? '');
  return Object.keys(DISTRICT_CROPS).find((district) => text.includes(normalize(district))) ?? null;
}

function level(value?: string | null) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function soilScore(crop: CropInfo, soil: SoilSnapshot | null | undefined): { score: number; fit: CropSuitability['soilFit']; notes: string[] } {
  if (!soil) return { score: 10, fit: 'conditional' as const, notes: ['No soil report yet'] };
  const notes: string[] = [];
  let score = 20;
  const ph = soil.ph != null && soil.ph !== '' ? Number(soil.ph) : null;
  if (ph != null && Number.isFinite(ph)) {
    const [lo, hi] = crop.idealPh;
    if (ph >= lo && ph <= hi) {
      score += 35;
      notes.push(`pH ${ph} fits`);
    } else if (ph >= lo - 0.5 && ph <= hi + 0.5) {
      score += 18;
      notes.push(`pH ${ph} needs correction`);
    } else {
      score -= 10;
      notes.push(`pH ${ph} is outside ideal range`);
    }
  }

  const lowN = level(soil.nitrogen) === 'low';
  const lowP = level(soil.phosphorus) === 'low';
  const lowK = level(soil.potassium) === 'low';
  if (crop.key === 'Black gram' || crop.key === 'Green gram') {
    if (lowN) {
      score += 12;
      notes.push('pulse crop can improve nitrogen');
    }
  } else if (lowN) {
    score -= 8;
    notes.push('nitrogen correction needed');
  }
  if (lowP) {
    score -= 5;
    notes.push('phosphorus correction needed');
  }
  if (lowK && ['Banana', 'Sugarcane', 'Tomato', 'Brinjal', 'Chilli'].includes(crop.key)) {
    score -= 8;
    notes.push('potassium correction needed');
  }

  const fit = score >= 45 ? 'good' : score >= 25 ? 'conditional' : 'poor';
  return { score, fit, notes };
}

export function getSuitableCrops(address?: string | null, soil?: SoilSnapshot | null): CropSuitability[] {
  const district = districtFromAddress(address);
  const districtCrops = district ? DISTRICT_CROPS[district] : [];
  const baseCrops = districtCrops.length
    ? getAllCropInfos().filter((crop) => districtCrops.includes(crop.key))
    : getAllCropInfos();

  return baseCrops
    .map((crop) => {
      const soilResult = soilScore(crop, soil);
      const districtMatch = !districtCrops.length || districtCrops.includes(crop.key);
      const score = soilResult.score + (districtMatch ? 30 : 0);
      return {
        cropName: crop.key,
        score,
        districtMatch,
        soilFit: soilResult.fit,
        reason: soilResult.notes.slice(0, 2).join('; ') || 'Matches local crop pattern',
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
