import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { industryGroups } from "@/data/industries";
import { Label } from "@/components/ui/label";

interface TwoLevelIndustrySelectorProps {
  groupValue?: string;
  industryValue?: string;
  onGroupChange: (group: string) => void;
  onIndustryChange: (industry: string) => void;
  className?: string;
}

export function TwoLevelIndustrySelector({
  groupValue,
  industryValue,
  onGroupChange,
  onIndustryChange,
  className,
}: TwoLevelIndustrySelectorProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [industryOpen, setIndustryOpen] = useState(false);

  const selectedGroup = useMemo(
    () => industryGroups.find((g) => g.value === groupValue),
    [groupValue]
  );

  const selectedIndustry = useMemo(
    () => selectedGroup?.industries.find((i) => i.value === industryValue),
    [selectedGroup, industryValue]
  );

  const availableIndustries = selectedGroup?.industries || [];

  const handleGroupChange = (newGroup: string) => {
    onGroupChange(newGroup);
    onIndustryChange("");
    setGroupOpen(false);
  };

  return (
    <div className={cn("grid sm:grid-cols-2 gap-4", className)}>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Industry Group</Label>
        <Popover open={groupOpen} onOpenChange={setGroupOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={groupOpen}
              className="w-full justify-between font-normal"
              data-testid="button-industry-group-selector"
            >
              <span className="truncate">
                {selectedGroup?.label || "Select group..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search groups..."
                data-testid="input-industry-group-search"
              />
              <CommandList>
                <CommandEmpty>No group found.</CommandEmpty>
                <CommandGroup>
                  {industryGroups.map((group) => (
                    <CommandItem
                      key={group.value}
                      value={group.label}
                      onSelect={() => handleGroupChange(group.value)}
                      data-testid={`industry-group-item-${group.value}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          groupValue === group.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {group.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Industry</Label>
        {groupValue === "other" ? (
          <Input
            value={industryValue || ""}
            onChange={(e) => onIndustryChange(e.target.value)}
            placeholder="Enter your industry..."
            data-testid="input-industry-other"
          />
        ) : (
          <Popover open={industryOpen} onOpenChange={setIndustryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={industryOpen}
                className="w-full justify-between font-normal"
                disabled={!groupValue}
                data-testid="button-industry-selector"
              >
                <span className="truncate">
                  {selectedIndustry?.label || 
                    (groupValue ? "Select industry..." : "Select group first")}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search industries..."
                  data-testid="input-industry-search"
                />
                <CommandList>
                  <CommandEmpty>No industry found.</CommandEmpty>
                  <CommandGroup>
                    {availableIndustries.map((industry) => (
                      <CommandItem
                        key={industry.value}
                        value={industry.label}
                        onSelect={() => {
                          onIndustryChange(industry.value);
                          setIndustryOpen(false);
                        }}
                        data-testid={`industry-item-${industry.value}`}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            industryValue === industry.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {industry.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
