import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/investor/notes")({
  component: NotesPage,
});

type NoteRow = {
  id: string;
  startupId: string;
  startupName?: string | null;
  content: string;
  category?: string | null;
  isPinned: boolean;
  updatedAt: string;
};

function NotesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["investor", "notes"],
    queryFn: () => customFetch<NoteRow[]>("/investor/notes"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Startup Notes</h1>
          <p className="text-muted-foreground text-pretty">
            Capture insights and track follow-ups across startups.
          </p>
        </div>
        <Card>
          <CardContent className="py-10">
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load notes: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const notes = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Startup Notes</h1>
        <p className="text-muted-foreground text-pretty">
          Capture insights and track follow-ups across startups.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={notes}
            columns={[
              { header: "Company", accessor: "startupName" },
              {
                header: "Category",
                cell: (row) =>
                  row.category ? (
                    <Badge variant="secondary">{row.category}</Badge>
                  ) : (
                    "—"
                  ),
              },
              { header: "Note", accessor: "content" },
              {
                header: "Pinned",
                cell: (row) => (row.isPinned ? "Yes" : "No"),
              },
              {
                header: "Updated",
                cell: (row) =>
                  row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—",
              },
            ]}
            rowKey={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
