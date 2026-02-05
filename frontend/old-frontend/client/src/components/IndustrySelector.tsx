import { useState } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { industryGroups, type IndustryGroup, type Industry } from "@/data/industries";

interface IndustrySelectorProps {
  value?: string;
  groupValue?: string;
  onValueChange: (industry: string, group: string) => void;
  placeholder?: string;
  className?: string;
}

export function IndustrySelector({
  value,
  groupValue,
  onValueChange,
  placeholder = "Select industry...",
  className,
}: IndustrySelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedIndustry = value
    ? industryGroups
        .flatMap((g) => g.industries)
        .find((i) => i.value === value)
    : null;

  const selectedGroup = groupValue
    ? industryGroups.find((g) => g.value === groupValue)
    : null;

  const displayText = selectedIndustry
    ? `${selectedGroup?.label || ""} > ${selectedIndustry.label}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          data-testid="button-industry-selector"
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 opacity-50" />
            <span className="truncate">{displayText}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search industries..." data-testid="input-industry-search" />
          <CommandList>
            <CommandEmpty>No industry found.</CommandEmpty>
            {industryGroups.map((group) => (
              <CommandGroup key={group.value} heading={group.label}>
                {group.industries.map((industry) => (
                  <CommandItem
                    key={industry.value}
                    value={`${group.label} ${industry.label}`}
                    onSelect={() => {
                      onValueChange(industry.value, group.value);
                      setOpen(false);
                    }}
                    data-testid={`industry-item-${industry.value}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === industry.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {industry.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
