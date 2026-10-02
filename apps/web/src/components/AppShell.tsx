import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  Briefcase,
  CalendarClock,
  ChevronsUpDown,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PenLine,
  Plus,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { ProfileSummary } from "@/lib/types";
import { Badge } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const sections: Array<{ title?: string; items: NavItem[] }> = [
  {
    items: [
      { to: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-4" /> },
      { to: "applications", label: "Applications", icon: <Briefcase className="size-4" /> },
      { to: "inbox", label: "Inbox", icon: <Inbox className="size-4" /> },
      { to: "runs", label: "Run logs", icon: <Activity className="size-4" /> },
    ],
  },
  {
    title: "Profile",
    items: [
      { to: "resume", label: "Resume", icon: <FileText className="size-4" /> },
      { to: "skills", label: "Skills", icon: <Sparkles className="size-4" /> },
      { to: "preferences", label: "Job preferences", icon: <SlidersHorizontal className="size-4" /> },
      { to: "style", label: "Writing style", icon: <PenLine className="size-4" /> },
    ],
  },
  {
    title: "Automation",
    items: [
      { to: "sources", label: "Sources", icon: <Globe className="size-4" /> },
      { to: "schedule", label: "Schedule & limits", icon: <CalendarClock className="size-4" /> },
      { to: "settings", label: "Settings", icon: <Settings className="size-4" /> },
    ],
  },
];

const mobilePrimary = sections[0].items;

export function useProfiles() {
  return useQuery({ queryKey: ["profiles"], queryFn: () => api.get<ProfileSummary[]>("/profiles") });
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      onClick={() => setTheme(next)}
      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
    >
      <Icon className="size-4" />
    </button>
  );
}

function ProfileSwitcher({ current }: { current?: ProfileSummary }) {
  const { data: profiles = [] } = useProfiles();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-600 text-xs font-semibold text-white">
          {current?.name.slice(0, 1).toUpperCase() ?? "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{current?.name ?? "Select profile"}</span>
          {current && (
            <span className="block text-xs text-zinc-500">{current.dryRun ? "Dry run" : "Live"}</span>
          )}
        </span>
        <ChevronsUpDown className="size-4 text-zinc-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg bg-white p-1 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800" role="listbox">
          {profiles.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === current?.id}
              onClick={() => {
                setOpen(false);
                localStorage.setItem("jfa-profile", p.id);
                navigate(`/p/${p.id}/${p.onboarded ? "dashboard" : "resume"}`);
              }}
              className={clsx(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                p.id === current?.id && "font-medium",
              )}
            >
              <span className="truncate">{p.name}</span>
              {!p.onboarded && <Badge tone="amber">setup</Badge>}
            </button>
          ))}
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <button
            onClick={() => {
              setOpen(false);
              navigate("/profiles");
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Users className="size-4" /> Manage profiles
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate("/profiles?new=1");
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Plus className="size-4" /> New profile
          </button>
        </div>
      )}
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{s.title}</p>}
          <ul className="space-y-0.5">
            {s.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                      isActive
                        ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await api.post("/auth/logout");
    qc.clear();
    navigate("/login");
  };
}

export function AppShell() {
  const { profileId } = useParams();
  const { data: profiles } = useProfiles();
  const current = profiles?.find((p) => p.id === profileId);
  const [drawer, setDrawer] = useState(false);
  const logout = useLogout();

  useEffect(() => {
    if (profileId) localStorage.setItem("jfa-profile", profileId);
  }, [profileId]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-200 bg-white px-3 py-4 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between px-2">
          <span className="text-sm font-semibold tracking-tight">Job Autopilot</span>
          <ThemeToggle />
        </div>
        <ProfileSwitcher current={current} />
        <div className="mt-5 flex-1 overflow-y-auto">
          <NavItems />
        </div>
        <button
          onClick={logout}
          className="mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/90">
        <button onClick={() => setDrawer(true)} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <span className="truncate text-sm font-semibold">{current?.name ?? "Job Autopilot"}</span>
        <ThemeToggle />
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-3 py-4 dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="text-sm font-semibold">Job Autopilot</span>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <ProfileSwitcher current={current} />
            <div className="mt-5 flex-1 overflow-y-auto">
              <NavItems onNavigate={() => setDrawer(false)} />
            </div>
            <button onClick={logout} className="mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/95">
        {mobilePrimary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex flex-col items-center gap-0.5 py-2 text-[11px]",
                isActive ? "text-accent-600 dark:text-accent-500" : "text-zinc-500",
              )
            }
          >
            {item.icon}
            {item.label.replace("Run logs", "Runs")}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
