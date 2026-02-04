import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { CurrencySelector } from "@/components/CurrencySelector";
import { getCurrencyByCode } from "@/data/currencies";

interface CurrencyInputProps {
  value?: string;
  currency?: string;
  onValueChange: (value: string) => void;
  onCurrencyChange?: (currency: string) => void;
  placeholder?: string;
  className?: string;
  showCurrencySelector?: boolean;
  testId?: string;
}

function formatNumberWithCommas(value: string): string {
  const numericValue = value.replace(/[^0-9.]/g, "");
  const parts = numericValue.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function parseFormattedNumber(value: string): string {
  return value.replace(/,/g, "");
}

export function CurrencyInput({
  value = "",
  currency = "USD",
  onValueChange,
  onCurrencyChange,
  placeholder = "0",
  className,
  showCurrencySelector = true,
  testId = "input-currency",
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    if (value) {
      setDisplayValue(formatNumberWithCommas(value));
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const numericValue = rawValue.replace(/[^0-9.]/g, "");
    
    const parts = numericValue.split(".");
    if (parts.length > 2) {
      return;
    }
    
    const formatted = formatNumberWithCommas(numericValue);
    setDisplayValue(formatted);
    onValueChange(parseFormattedNumber(formatted));
  };

  const currencyInfo = getCurrencyByCode(currency);

  return (
    <div className="flex gap-2">
      {showCurrencySelector && onCurrencyChange && (
        <CurrencySelector
          value={currency}
          onValueChange={onCurrencyChange}
          className="shrink-0"
        />
      )}
      <div className="relative flex-1">
        {!showCurrencySelector && currencyInfo && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {currencyInfo.symbol}
          </span>
        )}
        <Input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={!showCurrencySelector && currencyInfo ? "pl-8" : ""}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
