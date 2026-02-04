import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { AuthProvider } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_protected")({
  component: ProtectedContent,
});

function ProtectedContent() {
  const navigate = useNavigate();
  const { data, isPending } = useSession();
  const isAuthed = !!data?.user && !!data?.session;

  useEffect(() => {
    if (!isPending && !isAuthed) {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      navigate({
        to: "/login",
        search: () => ({ redirect: redirectPath }),
        replace: true,
      });
    }
  }, [isPending, isAuthed, navigate]);

  // Block dashboard flash until session resolves
  if (isPending || !isAuthed) {
    return null;
  }

  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

