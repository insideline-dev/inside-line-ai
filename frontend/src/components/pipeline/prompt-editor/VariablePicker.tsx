import { useMemo, useState } from "react";
import { ChevronDown, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type VariablePickerOption = {
  value: string;
  label: string;
  group: string;
  description?: string;
};

interface VariablePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: VariablePickerOption[];
  onSelect: (value: string) => void;
}

export function VariablePicker({
  open,
  onOpenChange,
  options,
  onSelect,
}: VariablePickerProps) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? options.filter((option) => {
          const haystack = `${option.label} ${option.value} ${option.group} ${option.description ?? ""}`;
          return haystack.toLowerCase().includes(query);
        })
      : options;

    const byGroup = new Map<string, VariablePickerOption[]>();
    for (const option of filtered) {
      const current = byGroup.get(option.group) ?? [];
      current.push(option);
      byGroup.set(option.group, current);
    }

    return Array.from(byGroup.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [options, search]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <WandSparkles className="h-3.5 w-3.5" />
          Insert Variable
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search fields..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No variables found.</CommandEmpty>
            {grouped.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((option) => (
                  <CommandItem
                    key={`${group}-${option.value}`}
                    value={`${group}:${option.value}`}
                    onSelect={() => {
                      onSelect(option.value);
                      onOpenChange(false);
                      setSearch("");
                    }}
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="font-mono text-xs">{option.label}</span>
                    {option.description ? (
                      <span className="text-[11px] text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
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
