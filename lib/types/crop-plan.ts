export interface Milestone {
  id: string;
  label: string;
  date: string;
  durationDays: number;
  tasks: string;
  estimatedCost: number;
  weatherRequirement: string;
  status?: 'pending' | 'active' | 'done' | 'alert';
}

export interface CropPlan {
  cropName: string;
  milestones: Milestone[];
  totalBudgetEstimate: number;
  harvestDate: string;
  sellWindow: string;
  storageNotes: string;
}

export interface SuggestedCrop extends CropPlan {
  reason: string;
  season: string;
  estimatedRevenue: string;
}
