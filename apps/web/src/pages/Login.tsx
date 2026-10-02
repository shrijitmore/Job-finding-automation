import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button, Card, ErrorNote, Field, Input, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import type { AuthStatus, SessionUser } from "@/lib/types";

export function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthStatus>("/auth/status") });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setup = status.data?.setupAllowed ?? false;

  const submit = useMutation({
    mutationFn: () => api.post<{ user: SessionUser }>(setup ? "/auth/setup" : "/auth/login", { email, password }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth"] });
      navigate("/");
    },
  });

  if (status.isLoading) return <PageLoader />;
  if (status.data?.user) return <Navigate to="/" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-accent-600 text-white shadow-sm">
            <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
              <path d="M9 17l5 5 9-12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Job Autopilot</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {setup ? "Create the owner account for this install." : "Sign in to continue."}
          </p>
        </div>
        <Card className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" hint={setup ? "At least 8 characters." : undefined}>
              <Input
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorNote error={submit.error} />
            <Button type="submit" className="w-full" loading={submit.isPending}>
              {setup ? "Create owner account" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
