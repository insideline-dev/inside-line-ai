import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStartupControllerUpdate } from "@/api/generated/startup/startup";
import { getStartupControllerFindOneQueryKey } from "@/api/generated/startup/startup";
import type { TeamMember } from "@/types/startup";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY_MEMBER: TeamMember = { name: "", role: "", linkedinUrl: "" };

const LINKEDIN_URL_PATTERN =
  /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/;

function isValidLinkedInUrl(url: string): boolean {
  return !url || LINKEDIN_URL_PATTERN.test(url);
}

interface EditTeamSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupId: string;
  teamMembers: TeamMember[];
}

export function EditTeamSheet({
  open,
  onOpenChange,
  startupId,
  teamMembers: initialMembers,
}: EditTeamSheetProps) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<TeamMember[]>(() =>
    initialMembers.length ? initialMembers.map((m) => ({ ...m })) : [{ ...EMPTY_MEMBER }],
  );

  const updateMutation = useStartupControllerUpdate();

  // Reset form when sheet opens with fresh data
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setMembers(
          initialMembers.length
            ? initialMembers.map((m) => ({ ...m }))
            : [{ ...EMPTY_MEMBER }],
        );
      }
      onOpenChange(nextOpen);
    },
    [initialMembers, onOpenChange],
  );

  const updateField = (
    index: number,
    field: keyof TeamMember,
    value: string,
  ) => {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addMember = () =>
    setMembers((prev) => [...prev, { ...EMPTY_MEMBER }]);

  const removeMember = (index: number) =>
    setMembers((prev) => prev.filter((_, i) => i !== index));

  const validationErrors = members.map((m: TeamMember) => {
    const errors: Record<string, string> = {};
    if (!m.name.trim()) errors.name = "Name is required";
    if (m.linkedinUrl && !isValidLinkedInUrl(m.linkedinUrl))
      errors.linkedinUrl = "Must be a valid LinkedIn profile URL";
    return errors;
  });

  const hasErrors = validationErrors.some((e) => Object.keys(e).length > 0);

  const handleSave = () => {
    if (hasErrors) return;

    const cleaned = members
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        role: m.role.trim(),
        linkedinUrl: m.linkedinUrl?.trim() || "",
      }));

    updateMutation.mutate(
      { id: startupId, data: { teamMembers: cleaned } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getStartupControllerFindOneQueryKey(startupId),
          });
          toast.success("Team members updated");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(
            `Failed to update team: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Team Members</SheetTitle>
          <SheetDescription>
            Update your team members and their LinkedIn profiles.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {members.map((member, index) => (
            <div
              key={index}
              className="relative space-y-3 rounded-lg border p-4"
            >
              {members.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMember(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`name-${index}`}>Name *</Label>
                <Input
                  id={`name-${index}`}
                  value={member.name}
                  onChange={(e) => updateField(index, "name", e.target.value)}
                  placeholder="Jane Doe"
                />
                {validationErrors[index]?.name && (
                  <p className="text-xs text-destructive">
                    {validationErrors[index].name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`role-${index}`}>Role</Label>
                <Input
                  id={`role-${index}`}
                  value={member.role}
                  onChange={(e) => updateField(index, "role", e.target.value)}
                  placeholder="CEO, CTO, etc."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`linkedin-${index}`}>LinkedIn URL</Label>
                <Input
                  id={`linkedin-${index}`}
                  value={member.linkedinUrl ?? ""}
                  onChange={(e) =>
                    updateField(index, "linkedinUrl", e.target.value)
                  }
                  placeholder="https://linkedin.com/in/janedoe"
                />
                {validationErrors[index]?.linkedinUrl && (
                  <p className="text-xs text-destructive">
                    {validationErrors[index].linkedinUrl}
                  </p>
                )}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={addMember}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Team Member
          </Button>
        </div>

        <SheetFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={hasErrors || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
