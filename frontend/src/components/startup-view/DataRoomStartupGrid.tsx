import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type DataRoomStartupItem = {
  id: string;
  name: string;
  logoUrl?: string | null;
  stage?: string | null;
  industry?: string | null;
  sectorIndustry?: string | null;
  status?: string | null;
};

function formatLabel(value?: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface DataRoomStartupGridProps {
  startups: DataRoomStartupItem[];
  onSelect: (startupId: string) => void;
  className?: string;
}

export function DataRoomStartupGrid({ startups, onSelect, className }: DataRoomStartupGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {startups.map((startup) => {
        const sector = startup.sectorIndustry ?? startup.industry ?? null;
        return (
          <button
            key={startup.id}
            type="button"
            onClick={() => onSelect(startup.id)}
            className="group cursor-pointer text-left focus:outline-none"
            aria-label={`Open data room for ${startup.name}`}
          >
            <Card className="h-full transition-shadow duration-150 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardContent className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 shrink-0 rounded-lg border bg-background">
                    {startup.logoUrl ? (
                      <AvatarImage
                        src={startup.logoUrl}
                        alt={startup.name}
                        className="object-contain"
                      />
                    ) : null}
                    <AvatarFallback className="rounded-lg text-sm font-semibold">
                      {startup.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h3 className="truncate text-base font-semibold">
                      {startup.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {startup.stage && (
                        <Badge variant="secondary" className="text-[11px]">
                          {formatLabel(startup.stage)}
                        </Badge>
                      )}
                      {sector && (
                        <span className="truncate text-xs text-muted-foreground">
                          {formatLabel(sector)}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>

                <div className="mt-auto flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                  <FolderOpen className="size-4" />
                  <span>Open data room</span>
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
