import type { MasterResume } from "@jfa/shared";

/** Sample master resume used by tests, fixtures and the fake LLM. */
export const SAMPLE_RESUME: MasterResume = {
  contact: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+1 555 0100",
    location: "Remote",
    headline: "Full Stack Engineer",
  },
  summary: "Full stack engineer building web products with React and Node.js.",
  yearsOfExperience: 5,
  experience: [
    {
      id: "exp-1",
      title: "Senior Software Engineer",
      company: "Acme Corp",
      location: "Remote",
      startDate: "Jan 2022",
      endDate: "Present",
      bullets: [
        "Built a checkout flow in React and TypeScript used by 2M monthly users",
        "Cut API latency by 40% by adding Redis caching",
        "Led migration from REST to GraphQL across 12 services",
      ],
    },
    {
      id: "exp-2",
      title: "Software Engineer",
      company: "Globex",
      location: "Pune, India",
      startDate: "Jun 2019",
      endDate: "Dec 2021",
      bullets: ["Shipped an internal analytics dashboard with Node.js and PostgreSQL", "Wrote end-to-end tests with Playwright"],
    },
  ],
  projects: [
    {
      id: "proj-1",
      name: "OpenInvoice",
      description: "Open source invoicing app",
      url: "https://github.com/janedoe/openinvoice",
      bullets: ["Reached 1,200 GitHub stars"],
      skills: ["Next.js", "Prisma"],
    },
  ],
  education: [
    {
      id: "edu-1",
      institution: "University of Pune",
      degree: "B.E.",
      field: "Computer Engineering",
      startDate: "2015",
      endDate: "2019",
      details: "",
    },
  ],
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Redis", "GraphQL", "Playwright"],
  metrics: ["2M monthly users", "40%", "12 services", "1,200 GitHub stars"],
  portfolioLinks: [
    { kind: "github", url: "https://github.com/janedoe", label: "GitHub" },
    { kind: "website", url: "https://janedoe.dev", label: "Portfolio" },
  ],
  certifications: [],
};
