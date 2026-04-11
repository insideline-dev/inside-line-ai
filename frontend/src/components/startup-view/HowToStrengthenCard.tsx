import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/MarkdownText";
import { Sparkles, ArrowRight } from "lucide-react";

interface HowToStrengthenCardProps {
  items: string[];
  title?: string;
  onExpand?: () => void;
  expandLabel?: string;
}

export function HowToStrengthenCard({
  items,
  title = "How to Strengthen This",
  onExpand,
  expandLabel = "See more recommendations",
}: HowToStrengthenCardProps) {
  const bullets = items.slice(0, 3).filter((item) => item.trim().length > 0);
  if (bullets.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5" data-testid="card-how-to-strengthen">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-2.5">
          {bullets.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-sm">
              <span className="mt-2 size-1.5 rounded-full bg-primary/60 shrink-0" />
              <MarkdownText className="flex-1 [&>p]:mb-0 [&>p]:leading-relaxed">
                {item}
              </MarkdownText>
            </li>
          ))}
        </ul>
        {onExpand && (
          <div className="mt-4 pt-3 border-t border-primary/10">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-sm text-primary hover:bg-transparent hover:text-primary/80"
              onClick={onExpand}
            >
              {expandLabel}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
