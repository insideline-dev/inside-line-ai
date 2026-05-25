import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

interface PortfolioCompany {
  name: string;
  description: string;
  websiteUrl?: string;
}

interface PortfolioFromWebsiteCardProps {
  companies: PortfolioCompany[];
}

const PAGE_SIZE = 10;

export function PortfolioFromWebsiteCard({ companies }: PortfolioFromWebsiteCardProps) {
  const [page, setPage] = useState(0);

  if (!companies.length) return null;

  const totalPages = Math.ceil(companies.length / PAGE_SIZE);
  const visible = companies.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Portfolio from your website
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {companies.length} companies found on your fund website
            </p>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((company) => (
            <div
              key={company.name}
              className="flex flex-col gap-1 border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{company.name}</span>
                {company.websiteUrl && (
                  <a
                    href={company.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {company.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {company.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
