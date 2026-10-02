import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emptyMasterResume, PORTFOLIO_KINDS, type MasterResume, type PortfolioLink } from "@jfa/shared";
import { ExternalLink, FileUp, Plus, Trash2, UploadCloud } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SaveBar } from "@/components/SaveBar";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, PageLoader, Select, Spinner, TagInput, Textarea } from "@/components/ui";
import { api, fileUrl } from "@/lib/api";
import { uid, useProfile, useProfileId, useSaveProfile } from "@/lib/profile";

interface UploadResult {
  draft: MasterResume;
  suggestedSkills: string[];
}

const QUICK_LINKS: Array<{ kind: PortfolioLink["kind"]; label: string; placeholder: string }> = [
  { kind: "github", label: "GitHub", placeholder: "https://github.com/you" },
  { kind: "behance", label: "Behance", placeholder: "https://behance.net/you" },
  { kind: "dribbble", label: "Dribbble", placeholder: "https://dribbble.com/you" },
  { kind: "youtube", label: "YouTube", placeholder: "https://youtube.com/@you" },
  { kind: "instagram", label: "Instagram", placeholder: "https://instagram.com/you" },
  { kind: "website", label: "Personal site", placeholder: "https://you.com" },
];

function lines(s: string): string[] {
  return s.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
}

function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        over ? "border-accent-500 bg-accent-50 dark:bg-accent-500/10" : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      {busy ? (
        <>
          <Spinner className="size-8" />
          <p className="font-medium">Reading your resume…</p>
          <p className="text-sm text-zinc-500">Claude is extracting experience, projects, skills and links. This takes about 20 seconds.</p>
        </>
      ) : (
        <>
          <UploadCloud className="size-10 text-zinc-400" />
          <div>
            <p className="font-medium">Drop your resume here</p>
            <p className="text-sm text-zinc-500">PDF or DOCX, up to 10 MB</p>
          </div>
          <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => input.current?.click()}>
            Choose file
          </Button>
          <input
            ref={input}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            aria-label="Resume file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} actions={actions} />
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </Card>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
      <Trash2 className="size-4" />
    </button>
  );
}

export function ResumePage() {
  const profileId = useProfileId();
  const { data: profile, isLoading } = useProfile();
  const save = useSaveProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [dirty, setDirty] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [isDraft, setIsDraft] = useState(false);
  // Bumped on upload so uncontrolled bullet fields remount with the new draft.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (profile && !dirty) setResume(profile.masterResume);
  }, [profile, dirty]);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<UploadResult>(`/profiles/${profileId}/resume`, form);
    },
    onSuccess: (res) => {
      setResume(res.draft);
      setSuggested(res.suggestedSkills);
      setPicked(new Set(res.suggestedSkills));
      setDirty(true);
      setIsDraft(true);
      setVersion((v) => v + 1);
      qc.invalidateQueries({ queryKey: ["profile", profileId] });
    },
  });

  if (isLoading || !profile) return <PageLoader />;

  const update = (fn: (r: MasterResume) => MasterResume) => {
    setResume((r) => fn(r ?? emptyMasterResume()));
    setDirty(true);
  };

  const onSave = async () => {
    if (!resume) return;
    const firstTime = !profile.onboardedAt;
    await save.mutateAsync({ masterResume: resume, onboarded: true });
    if (picked.size) {
      const current = await api.get<{ skills: Array<{ name: string; tier: string }> }>(`/profiles/${profileId}/skills`);
      await api.put(`/profiles/${profileId}/skills`, {
        skills: [...current.skills, ...[...picked].map((name) => ({ name, tier: "core" }))],
      });
      qc.invalidateQueries({ queryKey: ["skills", profileId] });
    }
    setDirty(false);
    setIsDraft(false);
    setSuggested([]);
    if (firstTime) navigate(`/p/${profileId}/skills`);
  };

  if (!resume) {
    return (
      <>
        <PageHeader title="Upload your resume" description="We turn it into a structured master resume. You can review and edit everything before saving." />
        <Card className="p-4 sm:p-6">
          <Dropzone onFile={(f) => upload.mutate(f)} busy={upload.isPending} />
          <div className="mt-3">
            <ErrorNote error={upload.error} />
          </div>
          <div className="mt-4 text-center">
            <button className="text-sm text-zinc-500 underline-offset-2 hover:underline" onClick={() => update((r) => r)}>
              Or fill it in manually
            </button>
          </div>
        </Card>
      </>
    );
  }

  const linkFor = (kind: PortfolioLink["kind"]) => resume.portfolioLinks.find((l) => l.kind === kind);

  return (
    <>
      <PageHeader
        title="Master resume"
        description={isDraft ? "Review what we parsed. Fix anything that looks wrong, then save." : "The source of truth for every tailored resume. Facts here are never changed by the AI."}
        actions={
          <>
            {profile.resumeFileKey && (
              <a href={fileUrl(`/profiles/${profileId}/resume/file`)} target="_blank" rel="noreferrer">
                <Button variant="ghost" icon={<ExternalLink className="size-4" />}>Original</Button>
              </a>
            )}
            <label className="inline-flex">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx"
                aria-label="Replace resume file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:bg-zinc-800">
                {upload.isPending ? <Spinner className="size-4" /> : <FileUp className="size-4" />} Re-upload
              </span>
            </label>
          </>
        }
      />
      <ErrorNote error={upload.error} />

      <div className="space-y-5">
        {isDraft && suggested.length > 0 && (
          <Section title="Add these skills to your profile?" description="Found in your resume. Unticked skills are not added. You can tag them later.">
            <div className="flex flex-wrap gap-2">
              {suggested.map((s) => (
                <label key={s} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm ring-1 ring-zinc-200 has-[:checked]:bg-accent-50 has-[:checked]:ring-accent-500 dark:ring-zinc-700 dark:has-[:checked]:bg-accent-500/10">
                  <input
                    type="checkbox"
                    className="accent-accent-600"
                    checked={picked.has(s)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(s);
                      else next.delete(s);
                      setPicked(next);
                      setDirty(true);
                    }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </Section>
        )}

        <Section title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["name", "headline", "email", "phone", "location"] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <Input value={resume.contact[k]} onChange={(e) => update((r) => ({ ...r, contact: { ...r.contact, [k]: e.target.value } }))} />
              </Field>
            ))}
            <Field label="Years of experience">
              <Input
                type="number"
                min={0}
                max={50}
                value={resume.yearsOfExperience}
                onChange={(e) => update((r) => ({ ...r, yearsOfExperience: Number(e.target.value) || 0 }))}
              />
            </Field>
          </div>
          <Field label="Summary">
            <Textarea rows={4} value={resume.summary} onChange={(e) => update((r) => ({ ...r, summary: e.target.value }))} />
          </Field>
        </Section>

        <Section title="Portfolio links" description="These matter a lot for design, video and content roles. They go near the top of creative resumes.">
          <div className="grid gap-4 sm:grid-cols-2">
            {QUICK_LINKS.map((q) => (
              <Field key={q.kind} label={q.label}>
                <Input
                  type="url"
                  placeholder={q.placeholder}
                  value={linkFor(q.kind)?.url ?? ""}
                  onChange={(e) =>
                    update((r) => {
                      const others = r.portfolioLinks.filter((l) => l.kind !== q.kind);
                      const url = e.target.value;
                      return { ...r, portfolioLinks: url ? [...others, { kind: q.kind, url, label: q.label }] : others };
                    })
                  }
                />
              </Field>
            ))}
          </div>
          {resume.portfolioLinks
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => !QUICK_LINKS.some((q) => q.kind === l.kind))
            .map(({ l, i }) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="Type" className="w-32">
                  <Select
                    value={l.kind}
                    onChange={(e) =>
                      update((r) => ({ ...r, portfolioLinks: r.portfolioLinks.map((x, j) => (j === i ? { ...x, kind: e.target.value as PortfolioLink["kind"] } : x)) }))
                    }
                  >
                    {PORTFOLIO_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Label" className="w-40">
                  <Input value={l.label} onChange={(e) => update((r) => ({ ...r, portfolioLinks: r.portfolioLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} />
                </Field>
                <Field label="URL" className="min-w-48 flex-1">
                  <Input value={l.url} onChange={(e) => update((r) => ({ ...r, portfolioLinks: r.portfolioLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))} />
                </Field>
                <RemoveButton label="Remove link" onClick={() => update((r) => ({ ...r, portfolioLinks: r.portfolioLinks.filter((_, j) => j !== i) }))} />
              </div>
            ))}
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => update((r) => ({ ...r, portfolioLinks: [...r.portfolioLinks, { kind: "other", url: "", label: "" }] }))}
          >
            Add another link
          </Button>
        </Section>

        <Section
          title="Experience"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() =>
                update((r) => ({
                  ...r,
                  experience: [...r.experience, { id: uid("exp"), title: "", company: "", location: "", startDate: "", endDate: "", bullets: [] }],
                }))
              }
            >
              Add
            </Button>
          }
        >
          {resume.experience.length === 0 && <p className="text-sm text-zinc-500">No experience entries.</p>}
          {resume.experience.map((e, i) => (
            <div key={`${version}-${e.id}`} className="space-y-3 rounded-lg bg-zinc-50 p-3 sm:p-4 dark:bg-zinc-950/50">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Title"><Input value={e.title} onChange={(ev) => update((r) => ({ ...r, experience: r.experience.map((x, j) => (j === i ? { ...x, title: ev.target.value } : x)) }))} /></Field>
                  <Field label="Company"><Input value={e.company} onChange={(ev) => update((r) => ({ ...r, experience: r.experience.map((x, j) => (j === i ? { ...x, company: ev.target.value } : x)) }))} /></Field>
                  <Field label="Start"><Input value={e.startDate} onChange={(ev) => update((r) => ({ ...r, experience: r.experience.map((x, j) => (j === i ? { ...x, startDate: ev.target.value } : x)) }))} /></Field>
                  <Field label="End"><Input value={e.endDate} onChange={(ev) => update((r) => ({ ...r, experience: r.experience.map((x, j) => (j === i ? { ...x, endDate: ev.target.value } : x)) }))} /></Field>
                  <Field label="Location" className="sm:col-span-2"><Input value={e.location} onChange={(ev) => update((r) => ({ ...r, experience: r.experience.map((x, j) => (j === i ? { ...x, location: ev.target.value } : x)) }))} /></Field>
                </div>
                <RemoveButton label="Remove experience" onClick={() => update((r) => ({ ...r, experience: r.experience.filter((_, j) => j !== i) }))} />
              </div>
              <Field label="Bullets" hint="One per line.">
                <Textarea rows={Math.max(3, e.bullets.length + 1)} defaultValue={e.bullets.join("\n")} onBlur={(ev) => update((r) => ({ ...r, experience: r.experience.map((x, j) => (j === i ? { ...x, bullets: lines(ev.target.value) } : x)) }))} />
              </Field>
            </div>
          ))}
        </Section>

        <Section
          title="Projects"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() => update((r) => ({ ...r, projects: [...r.projects, { id: uid("proj"), name: "", description: "", url: "", bullets: [], skills: [] }] }))}
            >
              Add
            </Button>
          }
        >
          {resume.projects.length === 0 && <p className="text-sm text-zinc-500">No projects.</p>}
          {resume.projects.map((p, i) => (
            <div key={`${version}-${p.id}`} className="space-y-3 rounded-lg bg-zinc-50 p-3 sm:p-4 dark:bg-zinc-950/50">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Project name"><Input value={p.name} onChange={(ev) => update((r) => ({ ...r, projects: r.projects.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) }))} /></Field>
                  <Field label="Link"><Input value={p.url} onChange={(ev) => update((r) => ({ ...r, projects: r.projects.map((x, j) => (j === i ? { ...x, url: ev.target.value } : x)) }))} /></Field>
                  <Field label="Description" className="sm:col-span-2"><Input value={p.description} onChange={(ev) => update((r) => ({ ...r, projects: r.projects.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)) }))} /></Field>
                </div>
                <RemoveButton label="Remove project" onClick={() => update((r) => ({ ...r, projects: r.projects.filter((_, j) => j !== i) }))} />
              </div>
              <Field label="Bullets" hint="One per line.">
                <Textarea rows={3} defaultValue={p.bullets.join("\n")} onBlur={(ev) => update((r) => ({ ...r, projects: r.projects.map((x, j) => (j === i ? { ...x, bullets: lines(ev.target.value) } : x)) }))} />
              </Field>
              <Field label="Tools used">
                <TagInput label="Project tools" value={p.skills} onChange={(v) => update((r) => ({ ...r, projects: r.projects.map((x, j) => (j === i ? { ...x, skills: v } : x)) }))} />
              </Field>
            </div>
          ))}
        </Section>

        <Section
          title="Education"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() => update((r) => ({ ...r, education: [...r.education, { id: uid("edu"), institution: "", degree: "", field: "", startDate: "", endDate: "", details: "" }] }))}
            >
              Add
            </Button>
          }
        >
          {resume.education.map((e, i) => (
            <div key={e.id} className="flex items-start gap-2 rounded-lg bg-zinc-50 p-3 sm:p-4 dark:bg-zinc-950/50">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                {(["institution", "degree", "field", "startDate", "endDate", "details"] as const).map((k) => (
                  <Field key={k} label={k === "startDate" ? "Start" : k === "endDate" ? "End" : k[0].toUpperCase() + k.slice(1)}>
                    <Input value={e[k]} onChange={(ev) => update((r) => ({ ...r, education: r.education.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)) }))} />
                  </Field>
                ))}
              </div>
              <RemoveButton label="Remove education" onClick={() => update((r) => ({ ...r, education: r.education.filter((_, j) => j !== i) }))} />
            </div>
          ))}
        </Section>

        <Section title="Metrics and certifications" description="Tailored resumes may only use numbers listed in your experience and here.">
          <Field label="Metrics">
            <TagInput label="Metrics" value={resume.metrics} onChange={(v) => update((r) => ({ ...r, metrics: v }))} placeholder="e.g. 2M monthly users" />
          </Field>
          <Field label="Certifications">
            <TagInput label="Certifications" value={resume.certifications} onChange={(v) => update((r) => ({ ...r, certifications: v }))} />
          </Field>
          <Field label="Skills mentioned in resume" hint={<>Tag them as core or extended on the <Badge>Skills</Badge> page.</>}>
            <TagInput label="Resume skills" value={resume.skills} onChange={(v) => update((r) => ({ ...r, skills: v }))} />
          </Field>
        </Section>
      </div>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        saved={save.isSuccess}
        error={save.error}
        onSave={onSave}
        onReset={() => {
          setResume(profile.masterResume);
          setDirty(false);
          setIsDraft(false);
        }}
        label={isDraft ? "Save master resume" : "Save changes"}
      />
    </>
  );
}
