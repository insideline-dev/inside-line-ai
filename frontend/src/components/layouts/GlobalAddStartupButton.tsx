import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Zap, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickAddStartupDialog } from "@/routes/_protected/admin/-components/QuickAddStartupDialog";
import { BulkUploadStartupsDialog } from "@/routes/_protected/admin/-components/BulkUploadStartupsDialog";
import type { UserRole } from "@/types";

const submitRouteByRole: Partial<Record<UserRole, string>> = {
  investor: "/investor/submit",
  founder: "/founder/submit",
  scout: "/scout/submit",
};

interface Props {
  role: UserRole;
}

export function GlobalAddStartupButton({ role }: Props) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  if (role === "admin") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" data-testid="global-add-startup">
              <Plus className="w-4 h-4 mr-2" />
              Add Startup
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-none">
            <DropdownMenuItem onSelect={() => setQuickOpen(true)}>
              <Zap className="mr-2 h-4 w-4" />
              <div className="flex flex-col">
                <span>Single startup</span>
                <span className="text-xs text-muted-foreground">
                  Add one company with details
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setBulkOpen(true)}>
              <UploadCloud className="mr-2 h-4 w-4" />
              <div className="flex flex-col">
                <span>Bulk upload</span>
                <span className="text-xs text-muted-foreground">
                  Import multiple from CSV
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <QuickAddStartupDialog
          open={quickOpen}
          onOpenChange={setQuickOpen}
          hideTrigger
        />
        <BulkUploadStartupsDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          hideTrigger
        />
      </>
    );
  }

  const route = submitRouteByRole[role];
  if (!route) return null;

  return (
    <Button asChild size="sm" data-testid="global-add-startup">
      <Link to={route}>
        <Plus className="w-4 h-4 mr-2" />
        Add Startup
      </Link>
    </Button>
  );
}
