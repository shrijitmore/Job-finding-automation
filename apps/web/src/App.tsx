import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell, useProfiles } from "@/components/AppShell";
import { PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import type { AuthStatus } from "@/lib/types";
import { LoginPage } from "@/pages/Login";
import { Placeholder } from "@/pages/Placeholder";
import { ProfilesPage } from "@/pages/Profiles";

function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthStatus>("/auth/status") });
  if (isLoading) return <PageLoader />;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Home() {
  const { data: profiles, isLoading } = useProfiles();
  if (isLoading) return <PageLoader />;
  if (!profiles?.length) return <Navigate to="/profiles" replace />;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("jfa-profile");
  } catch {
    /* ignore */
  }
  const p = profiles.find((x) => x.id === saved) ?? profiles[0];
  return <Navigate to={`/p/${p.id}/${p.onboarded ? "dashboard" : "resume"}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/profiles"
        element={
          <RequireAuth>
            <ProfilesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/p/:profileId"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Placeholder title="Dashboard" />} />
        <Route path="applications" element={<Placeholder title="Applications" />} />
        <Route path="inbox" element={<Placeholder title="Inbox" />} />
        <Route path="runs" element={<Placeholder title="Run logs" />} />
        <Route path="resume" element={<Placeholder title="Resume" />} />
        <Route path="skills" element={<Placeholder title="Skills" />} />
        <Route path="preferences" element={<Placeholder title="Job preferences" />} />
        <Route path="style" element={<Placeholder title="Writing style" />} />
        <Route path="sources" element={<Placeholder title="Sources" />} />
        <Route path="schedule" element={<Placeholder title="Schedule & limits" />} />
        <Route path="settings" element={<Placeholder title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
