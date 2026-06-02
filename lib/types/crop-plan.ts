export interface Milestone {
  id: string;
  label: string;
  /** Stage start date (YYYY-MM-DD). */
  date: string;
  /** Stage end date (YYYY-MM-DD). Derived from date + durationDays when absent. */
  endDate?: string;
  durationDays: number;
  /** What the farmer should actually do in this stage (step-by-step). */
  tasks: string;
  estimatedCost: number;
  /** General agronomic weather need for the stage (from the AI). */
  weatherRequirement: string;
  /** Actual forecast summary for the stage's dates, when within the 16-day window. */
  weatherSummary?: string;
  /** True when adverse weather is forecast during this stage. */
  alert?: boolean;
  /** What to do about the forecast alert. */
  alertAdvice?: string;
  status?: 'pending' | 'active' | 'done' | 'alert';
}

export interface CropPlan {
  cropName: string;
  /** Date the farmer plans to start (anchor for all milestone dates). */
  startDate?: string;
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
