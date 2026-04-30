import { create } from "zustand";
import type { StartupStatus, FundingStage } from "@/types";

interface FilterState {
  search: string;
  status: StartupStatus | "all";
  stage: FundingStage | "all";
  scoreMin: number;
  scoreMax: number;
  sortBy: "createdAt" | "score" | "name";
  sortOrder: "asc" | "desc";
  /**
   * DS-E6-F2-S1 — single sub-thesis axis to focus the feed on (typically
   * one industry/sector from the investor's thesis.industries[] array).
   * `null` means "all axes". String compared case-insensitively against
   * startup.industry / startup.sectorIndustry / startup.sectorIndustryGroup.
   */
  thesisAxis: string | null;

  // Actions
  setSearch: (search: string) => void;
  setStatus: (status: StartupStatus | "all") => void;
  setStage: (stage: FundingStage | "all") => void;
  setScoreRange: (min: number, max: number) => void;
  setSortBy: (sortBy: FilterState["sortBy"]) => void;
  setSortOrder: (sortOrder: FilterState["sortOrder"]) => void;
  setThesisAxis: (axis: string | null) => void;
  resetFilters: () => void;
}

const defaultFilters = {
  search: "",
  status: "all" as const,
  stage: "all" as const,
  scoreMin: 0,
  scoreMax: 100,
  sortBy: "createdAt" as const,
  sortOrder: "desc" as const,
  thesisAxis: null,
};

export const useFilterStore = create<FilterState>((set) => ({
  ...defaultFilters,

  setSearch: (search) => set({ search }),
  setStatus: (status) => set({ status }),
  setStage: (stage) => set({ stage }),
  setScoreRange: (scoreMin, scoreMax) => set({ scoreMin, scoreMax }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setThesisAxis: (thesisAxis) => set({ thesisAxis }),
  resetFilters: () => set(defaultFilters),
}));
