import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";

export const STAGES = [
  { value: "pre_seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
  { value: "series_d", label: "Series D+" },
];

const INDUSTRY_GROUPS = [
  "Software",
  "Fintech",
  "Healthcare",
  "E-Commerce",
  "Consumer",
  "Enterprise",
  "AI/ML",
  "Climate",
  "Biotech",
  "Hardware",
  "Other",
];

export const REGIONS = [
  { value: "us", label: "United States" },
  { value: "europe", label: "Europe" },
  { value: "asia", label: "Asia" },
  { value: "latam", label: "Latin America" },
  { value: "mena", label: "Middle East" },
  { value: "africa", label: "Africa" },
  { value: "oceania", label: "Oceania" },
];

export interface FilterState {
  search: string;
  stages: string[];
  industries: string[];
  regions: string[];
  scoreRange: [number, number];
  source?: "all" | "my_submissions" | "matched";
}

interface SearchAndFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showScoreFilter?: boolean;
  hideSearch?: boolean;
  showSourceFilter?: boolean;
  hideActiveChips?: boolean;
  placeholder?: string;
}

export const SOURCE_OPTIONS = [
  { value: "all" as const, label: "All Startups" },
  { value: "my_submissions" as const, label: "My Submissions" },
  { value: "matched" as const, label: "Matched" },
];

export function SearchAndFilters({
  filters,
  onFiltersChange,
  showScoreFilter = true,
  hideSearch = false,
  showSourceFilter = false,
  hideActiveChips = false,
  placeholder = "Search by name or description..."
}: SearchAndFiltersProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.stages.length > 0) count++;
    if (filters.industries.length > 0) count++;
    if (filters.regions.length > 0) count++;
    if (showScoreFilter && (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100)) count++;
    if (filters.source && filters.source !== "all") count++;
    return count;
  }, [filters, showScoreFilter]);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const toggleArrayFilter = (key: "stages" | "industries" | "regions", value: string) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: updated });
  };

  const handleScoreRangeChange = (range: number[]) => {
    onFiltersChange({ ...filters, scoreRange: [range[0], range[1]] as [number, number] });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      search: "",
      stages: [],
      industries: [],
      regions: [],
      scoreRange: [0, 100],
      source: "all",
    });
  };

  const hasActiveFilters = filters.search || activeFilterCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {!hideSearch && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
            {filters.search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => handleSearchChange("")}
                data-testid="button-clear-search"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}

        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between gap-2 sm:w-[148px] sm:shrink-0"
              data-testid="button-filters"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    data-testid="button-clear-filters"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {showSourceFilter && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Source</Label>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_OPTIONS.map((option) => (
                      <Badge
                        key={option.value}
                        variant={(filters.source ?? "all") === option.value ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => onFiltersChange({ ...filters, source: option.value })}
                      >
                        {option.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">Stage</Label>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map((stage) => (
                    <Badge
                      key={stage.value}
                      variant={filters.stages.includes(stage.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayFilter("stages", stage.value)}
                      data-testid={`filter-stage-${stage.value}`}
                    >
                      {stage.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Industry</Label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRY_GROUPS.map((industry) => (
                    <Badge
                      key={industry}
                      variant={filters.industries.includes(industry) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayFilter("industries", industry)}
                      data-testid={`filter-industry-${industry.toLowerCase().replace(/\//g, "-")}`}
                    >
                      {industry}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Region</Label>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((region) => (
                    <Badge
                      key={region.value}
                      variant={filters.regions.includes(region.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayFilter("regions", region.value)}
                      data-testid={`filter-region-${region.value}`}
                    >
                      {region.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {showScoreFilter && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Score Range</Label>
                    <span className="text-sm text-muted-foreground">
                      {filters.scoreRange[0]} - {filters.scoreRange[1]}
                    </span>
                  </div>
                  <Slider
                    value={filters.scoreRange}
                    onValueChange={handleScoreRangeChange}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-score-range"
                  />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!hideActiveChips && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.stages.map((stage) => (
            <Badge
              key={stage}
              variant="secondary"
              className="gap-1"
            >
              {STAGES.find(s => s.value === stage)?.label || stage}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => toggleArrayFilter("stages", stage)}
              />
            </Badge>
          ))}
          {filters.industries.map((industry) => (
            <Badge
              key={industry}
              variant="secondary"
              className="gap-1"
            >
              {industry}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => toggleArrayFilter("industries", industry)}
              />
            </Badge>
          ))}
          {filters.regions.map((region) => (
            <Badge
              key={region}
              variant="secondary"
              className="gap-1"
            >
              {REGIONS.find(r => r.value === region)?.label || region}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => toggleArrayFilter("regions", region)}
              />
            </Badge>
          ))}
          {filters.source && filters.source !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {SOURCE_OPTIONS.find(o => o.value === filters.source)?.label}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, source: "all" })}
              />
            </Badge>
          )}
          {showScoreFilter && (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) && (
            <Badge variant="secondary" className="gap-1">
              Score: {filters.scoreRange[0]}-{filters.scoreRange[1]}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, scoreRange: [0, 100] })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export function useFilteredStartups<T extends {
  name: string;
  description?: string | null;
  stage?: string | null;
  industry?: string | null;
  sectorIndustryGroup?: string | null;
  location?: string | null;
  normalizedRegion?: string | null;
  overallScore?: number | null;
}>(startups: T[] | undefined, filters: FilterState): T[] {
  return useMemo(() => {
    if (!startups) return [];

    return startups.filter((startup) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const nameMatch = startup.name.toLowerCase().includes(searchLower);
        const descMatch = startup.description?.toLowerCase().includes(searchLower);
        if (!nameMatch && !descMatch) return false;
      }

      if (filters.stages.length > 0) {
        if (!startup.stage || !filters.stages.includes(startup.stage)) return false;
      }

      if (filters.industries.length > 0) {
        const industryGroup = startup.sectorIndustryGroup || startup.industry;
        const matchesIndustry = filters.industries.some(ind =>
          industryGroup?.toLowerCase().includes(ind.toLowerCase())
        );
        if (!matchesIndustry) return false;
      }

      if (filters.regions.length > 0) {
        const region = startup.normalizedRegion || startup.location?.toLowerCase();
        const matchesRegion = filters.regions.some(r => {
          if (startup.normalizedRegion === r) return true;
          const regionLabel = REGIONS.find(reg => reg.value === r)?.label.toLowerCase();
          return region?.includes(r) || (regionLabel && region?.includes(regionLabel));
        });
        if (!matchesRegion) return false;
      }

      if (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) {
        const score = startup.overallScore;
        if (score === null || score === undefined) return false;
        if (score < filters.scoreRange[0] || score > filters.scoreRange[1]) return false;
      }

      return true;
    });
  }, [startups, filters]);
}

export const defaultFilters: FilterState = {
  search: "",
  stages: [],
  industries: [],
  regions: [],
  scoreRange: [0, 100],
  source: "all",
};

