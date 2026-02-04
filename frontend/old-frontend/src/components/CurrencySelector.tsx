import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { currencies, type Currency } from "@/data/currencies";

interface CurrencySelectorProps {
  value?: string;
  onValueChange: (currency: string) => void;
  placeholder?: string;
  className?: string;
}

export function CurrencySelector({
  value = "USD",
  onValueChange,
  placeholder = "Currency",
  className,
}: CurrencySelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedCurrency = currencies.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[120px] justify-between font-normal", className)}
          data-testid="button-currency-selector"
        >
          <span className="truncate">
            {selectedCurrency ? `${selectedCurrency.symbol} ${selectedCurrency.code}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency..." data-testid="input-currency-search" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {currencies.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={`${currency.code} ${currency.name}`}
                  onSelect={() => {
                    onValueChange(currency.code);
                    setOpen(false);
                  }}
                  data-testid={`currency-item-${currency.code}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === currency.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="w-8">{currency.symbol}</span>
                  <span className="font-medium">{currency.code}</span>
                  <span className="ml-2 text-muted-foreground text-xs truncate">{currency.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
