import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StartupCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-start gap-6">
          <Skeleton className="w-16 h-16 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-3 w-full">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-3/4 max-w-md" />
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MatchCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row items-start gap-6">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <Skeleton className="w-12 h-12 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="flex flex-col items-center gap-1">
              <Skeleton className="w-12 h-12 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-3 w-full">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-2/3 max-w-md" />
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PrivateStartupCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="w-12 h-12 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-full mt-4" />
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminStatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <Skeleton className="w-10 h-10 rounded-full mx-auto mb-2" />
        <Skeleton className="h-7 w-10 mx-auto mb-1" />
        <Skeleton className="h-3 w-14 mx-auto" />
      </CardContent>
    </Card>
  );
}

export function MemoSectionSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function TeamProfileSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="w-16 h-16 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-3/4 max-w-xs" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DraftCardSkeleton() {
  return (
    <Card className="border-dashed border-chart-4/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-xs" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

interface StartupListSkeletonProps {
  count?: number;
  variant?: "startup" | "match" | "private" | "admin";
}

export function StartupListSkeleton({ count = 3, variant = "startup" }: StartupListSkeletonProps) {
  const SkeletonComponent = 
    variant === "match" ? MatchCardSkeleton :
    variant === "private" ? PrivateStartupCardSkeleton :
    StartupCardSkeleton;

  return (
    <div className={variant === "private" ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "grid gap-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonComponent key={i} />
      ))}
    </div>
  );
}

export function StatsGridSkeleton({ count = 4, variant = "default" }: { count?: number; variant?: "default" | "admin" }) {
  const SkeletonComponent = variant === "admin" ? AdminStatCardSkeleton : StatCardSkeleton;
  
  return (
    <div className={variant === "admin" 
      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3"
      : "grid grid-cols-2 md:grid-cols-4 gap-4"
    }>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonComponent key={i} />
      ))}
    </div>
  );
}
