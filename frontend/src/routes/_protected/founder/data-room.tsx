import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";
import { useStartupControllerFindAll } from "@/api/generated/startup/startup";
import { env } from "@/env";

export const Route = createFileRoute("/_protected/founder/data-room")({
  component: DataRoomPage,
});

type StartupItem = { id: string; name: string };

type DataRoomDoc = {
  id: string;
  assetUrl?: string | null;
  assetMimeType?: string | null;
  assetSize?: number | null;
  category: string;
  uploadedAt: string;
  visibleToInvestors?: string[] | null;
};

const CATEGORY_OPTIONS = ["pitch_deck", "financials", "legal", "product", "other"];

async function fetchDataRoom(startupId: string) {
  return fetch(`${env.VITE_API_BASE_URL}/startups/${startupId}/data-room`, {
    credentials: "include",
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to load data room");
    return res.json();
  });
}

async function uploadDocument(startupId: string, file: File, category: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const response = await fetch(
    `${env.VITE_API_BASE_URL}/startups/${startupId}/data-room`,
    {
      method: "POST",
      body: formData,
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Upload failed");
  }

  return response.json();
}

function DataRoomPage() {
  const queryClient = useQueryClient();
  const { data: response, isLoading: loadingStartups, error } = useStartupControllerFindAll();
  const startups = (response?.data as StartupItem[] | undefined) ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);

  const activeStartupId = useMemo(
    () => selectedId ?? startups[0]?.id ?? null,
    [selectedId, startups],
  );

  const { data: documents, isLoading: loadingDocs } = useQuery({
    queryKey: ["founder", "data-room", activeStartupId],
    queryFn: () => fetchDataRoom(activeStartupId!),
    enabled: !!activeStartupId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(activeStartupId!, file, category),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["founder", "data-room", activeStartupId],
      });
    },
  });

  if (loadingStartups) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            Upload and manage investor-facing documents.
          </p>
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load startups: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (startups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          Submit a startup to start managing your data room.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Data Room</h1>
        <p className="text-muted-foreground text-pretty">
          Upload and manage investor-facing documents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Startup</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={activeStartupId ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {startups.map((startup) => (
              <option key={startup.id} value={startup.id}>
                {startup.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Upload Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-pretty" htmlFor="data-room-category">
              Category
            </label>
            <select
              id="data-room-category"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <FileUploadDropzone onUpload={(file) => uploadMutation.mutate(file)} />
          {uploadMutation.error && (
            <p className="text-sm text-destructive text-pretty">
              {(uploadMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingDocs ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <DataTable
              data={(documents as DataRoomDoc[] | undefined) ?? []}
              columns={[
                { header: "Category", accessor: "category" },
                {
                  header: "File",
                  cell: (row) =>
                    row.assetUrl ? (
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={row.assetUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View file
                      </a>
                    ) : (
                      "—"
                    ),
                },
                {
                  header: "Visible To",
                  cell: (row) =>
                    row.visibleToInvestors?.length
                      ? `${row.visibleToInvestors.length} investors`
                      : "Private",
                },
                {
                  header: "Uploaded",
                  cell: (row) => new Date(row.uploadedAt).toLocaleDateString(),
                },
              ]}
              rowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
