import { FIELD_TEMPLATE, isCreativeField, type Field, type MasterResume, type PortfolioLink, type ProfileSkill, type TailoredResume, type TemplateKind } from "@jfa/shared";

/** Everything a template needs to render one tailored resume. */
export interface ResumeDoc {
  template: TemplateKind;
  name: string;
  headline: string;
  contactLine: string[];
  summary: string;
  portfolio: PortfolioLink[];
  experience: Array<{ title: string; company: string; location: string; dates: string; bullets: string[] }>;
  projects: Array<{ name: string; url: string; description: string; bullets: string[] }>;
  education: Array<{ institution: string; degree: string; dates: string; details: string }>;
  skills: string[];
  alsoWorkingWith: string[];
  certifications: string[];
}

export function templateFor(field: Field): TemplateKind {
  return FIELD_TEMPLATE[field] ?? "technical";
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Builds the final resume from the master resume plus the AI's choices. Facts (titles,
 * companies, dates, education) always come from the master resume, never from the model.
 * Skills are limited to the profile's list: core skills on the main line, extended skills
 * only under "Also working with".
 */
export function assembleResume(master: MasterResume, tailored: TailoredResume, skills: ProfileSkill[], field: Field): ResumeDoc {
  const core = skills.filter((s) => s.tier === "core").map((s) => s.name);
  const extended = skills.filter((s) => s.tier === "extended").map((s) => s.name);
  const canonical = (list: string[], name: string) => list.find((s) => sameName(s, name));

  const expById = new Map(master.experience.map((e) => [e.id, e]));
  const chosenExp = tailored.experience.filter((e) => expById.has(e.id));
  // Never drop a job from the history: keep every experience entry in master order.
  const experience = master.experience.map((e) => {
    const pick = chosenExp.find((c) => c.id === e.id);
    const bullets = (pick?.bullets.length ? pick.bullets : e.bullets).slice(0, 6);
    return { title: e.title, company: e.company, location: e.location, dates: [e.startDate, e.endDate].filter(Boolean).join(" to "), bullets };
  });

  const projById = new Map(master.projects.map((p) => [p.id, p]));
  const projects = tailored.projects
    .filter((p) => projById.has(p.id))
    .slice(0, 3)
    .map((p) => {
      const m = projById.get(p.id)!;
      return { name: m.name, url: m.url, description: m.description, bullets: p.bullets.slice(0, 3) };
    });

  const skillLine = [...new Set(tailored.skills.map((s) => canonical(core, s)).filter((s): s is string => Boolean(s)))];
  const also = [
    ...new Set(
      tailored.alsoWorkingWith
        .map((s) => canonical(extended, s))
        .filter((s): s is string => Boolean(s) && !skillLine.includes(s!)),
    ),
  ];

  const links = new Map(master.portfolioLinks.map((l) => [l.url.toLowerCase(), l]));
  const ordered = [
    ...tailored.portfolioLinks.map((u) => links.get(u.toLowerCase())).filter((l): l is PortfolioLink => Boolean(l)),
    ...master.portfolioLinks,
  ];
  const portfolio = [...new Map(ordered.map((l) => [l.url, l])).values()].slice(0, isCreativeField(field) ? 4 : 3);

  const c = master.contact;
  return {
    template: templateFor(field),
    name: c.name,
    headline: c.headline,
    contactLine: [c.email, c.phone, c.location].filter(Boolean),
    summary: tailored.summary.trim(),
    portfolio,
    experience,
    projects,
    education: master.education.map((e) => ({
      institution: e.institution,
      degree: [e.degree, e.field].filter(Boolean).join(", "),
      dates: [e.startDate, e.endDate].filter(Boolean).join(" to "),
      details: e.details,
    })),
    skills: skillLine.length ? skillLine : core.slice(0, 12),
    alsoWorkingWith: also,
    certifications: master.certifications,
  };
}
