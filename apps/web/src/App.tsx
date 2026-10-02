import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell, useProfiles } from "@/components/AppShell";
import { PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import type { AuthStatus } from "@/lib/types";
import { ApplicationDetailPage } from "@/pages/ApplicationDetail";
import { ApplicationsPage } from "@/pages/Applications";
import { DashboardPage } from "@/pages/Dashboard";
import { LoginPage } from "@/pages/Login";
import { Placeholder } from "@/pages/Placeholder";
import { PreferencesPage } from "@/pages/Preferences";
import { ProfilesPage } from "@/pages/Profiles";
import { ResumePage } from "@/pages/Resume";
import { SchedulePage } from "@/pages/Schedule";
import { SettingsPage } from "@/pages/Settings";
import { SkillsPage } from "@/pages/Skills";
import { SourcesPage } from "@/pages/Sources";
import { StylePage } from "@/pages/Style";

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
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="applications/:appId" element={<ApplicationDetailPage />} />
        <Route path="inbox" element={<Placeholder title="Inbox" />} />
        <Route path="runs" element={<Placeholder title="Run logs" />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="preferences" element={<PreferencesPage />} />
        <Route path="style" element={<StylePage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
