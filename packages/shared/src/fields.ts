export const FIELDS = [
  "engineering",
  "ai",
  "web3",
  "product",
  "design",
  "video",
  "content",
  "marketing",
  "leadership",
] as const;

export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  engineering: "Engineering",
  ai: "AI",
  web3: "Web3",
  product: "Product",
  design: "Design",
  video: "Video",
  content: "Content",
  marketing: "Marketing",
  leadership: "Leadership",
};

export type TemplateKind = "technical" | "portfolio" | "impact";

/** Which resume template a field uses. */
export const FIELD_TEMPLATE: Record<Field, TemplateKind> = {
  engineering: "technical",
  ai: "technical",
  web3: "technical",
  product: "impact",
  leadership: "impact",
  marketing: "impact",
  design: "portfolio",
  video: "portfolio",
  content: "portfolio",
};

/** Fields where portfolio links matter most and go near the top. */
export const CREATIVE_FIELDS: readonly Field[] = ["design", "video", "content"];

export function isCreativeField(field: Field): boolean {
  return CREATIVE_FIELDS.includes(field);
}

export interface RoleType {
  id: string;
  label: string;
  field: Field;
  /** Extra terms that suggest this role in a job title. */
  keywords: string[];
}

function roles(field: Field, list: Array<[string, string[]?]>): RoleType[] {
  return list.map(([label, keywords]) => ({
    id: `${field}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    label,
    field,
    keywords: keywords ?? [label.toLowerCase()],
  }));
}

export const ROLE_CATALOG: RoleType[] = [
  ...roles("engineering", [
    ["Frontend Engineer", ["frontend", "front-end", "react", "ui engineer"]],
    ["Backend Engineer", ["backend", "back-end", "api engineer", "server"]],
    ["Full Stack Engineer", ["full stack", "fullstack", "full-stack"]],
    ["Mobile Engineer", ["mobile", "ios", "android", "react native", "flutter"]],
    ["DevOps Engineer", ["devops", "platform engineer", "infrastructure"]],
    ["Site Reliability Engineer", ["sre", "site reliability"]],
    ["Data Engineer", ["data engineer", "etl", "analytics engineer"]],
    ["QA / Test Engineer", ["qa", "test engineer", "sdet", "quality"]],
    ["Security Engineer", ["security engineer", "appsec", "infosec"]],
    ["Embedded Engineer", ["embedded", "firmware"]],
    ["Software Engineer", ["software engineer", "software developer", "sde"]],
  ]),
  ...roles("ai", [
    ["AI Engineer", ["ai engineer", "llm", "genai", "generative ai"]],
    ["Machine Learning Engineer", ["machine learning", "ml engineer", "mle"]],
    ["Data Scientist", ["data scientist", "data science"]],
    ["ML Researcher", ["research scientist", "ml research", "ai research"]],
    ["MLOps Engineer", ["mlops", "ml platform", "ml infrastructure"]],
    ["Prompt Engineer", ["prompt engineer", "prompt"]],
    ["Computer Vision Engineer", ["computer vision", "cv engineer"]],
    ["NLP Engineer", ["nlp", "natural language"]],
  ]),
  ...roles("web3", [
    ["Smart Contract Engineer", ["smart contract", "solidity", "rust", "move"]],
    ["Blockchain Engineer", ["blockchain", "protocol engineer", "web3 engineer"]],
    ["Web3 Frontend Engineer", ["web3 frontend", "dapp"]],
    ["DeFi Engineer", ["defi"]],
    ["Smart Contract Auditor", ["auditor", "security researcher"]],
    ["Developer Relations (Web3)", ["devrel", "developer relations", "developer advocate"]],
    ["Community Manager (Web3)", ["community manager", "community lead"]],
  ]),
  ...roles("product", [
    ["Product Manager", ["product manager", "pm"]],
    ["Senior Product Manager", ["senior product manager", "sr. product manager"]],
    ["Technical Product Manager", ["technical product manager", "tpm"]],
    ["Product Owner", ["product owner"]],
    ["Product Analyst", ["product analyst"]],
    ["Product Operations", ["product operations", "product ops"]],
    ["Program Manager", ["program manager"]],
  ]),
  ...roles("design", [
    ["Product Designer", ["product designer"]],
    ["UI/UX Designer", ["ui designer", "ux designer", "ui/ux", "ux/ui"]],
    ["Graphic Designer", ["graphic designer"]],
    ["Brand Designer", ["brand designer", "visual designer"]],
    ["Motion Designer", ["motion designer", "motion graphics", "animator"]],
    ["UX Researcher", ["ux researcher", "user researcher"]],
    ["Illustrator", ["illustrator"]],
    ["3D Artist", ["3d artist", "3d designer", "blender"]],
  ]),
  ...roles("video", [
    ["Video Editor", ["video editor", "editor"]],
    ["Videographer", ["videographer", "camera operator"]],
    ["Motion Graphics Artist", ["motion graphics", "after effects"]],
    ["Colorist", ["colorist", "color grading"]],
    ["YouTube Editor", ["youtube editor", "youtube"]],
    ["Short-form Video Editor", ["short form", "reels", "tiktok", "shorts"]],
    ["Video Producer", ["video producer", "producer"]],
  ]),
  ...roles("content", [
    ["Content Writer", ["content writer", "writer"]],
    ["Copywriter", ["copywriter", "copy writer"]],
    ["Technical Writer", ["technical writer", "documentation"]],
    ["Content Strategist", ["content strategist", "content strategy"]],
    ["Content Creator", ["content creator", "creator"]],
    ["AI Content Creator", ["ai content", "ai video", "ai art", "generative content"]],
    ["Social Media Manager", ["social media manager", "social media"]],
    ["Scriptwriter", ["scriptwriter", "script writer"]],
    ["Editor (Written)", ["managing editor", "copy editor"]],
  ]),
  ...roles("marketing", [
    ["Growth Marketer", ["growth marketer", "growth"]],
    ["Performance Marketer", ["performance marketing", "paid ads", "ppc", "paid acquisition"]],
    ["SEO Specialist", ["seo"]],
    ["Product Marketing Manager", ["product marketing", "pmm"]],
    ["Marketing Manager", ["marketing manager"]],
    ["Content Marketer", ["content marketing"]],
    ["Email Marketer", ["email marketing", "lifecycle"]],
    ["Brand Manager", ["brand manager"]],
  ]),
  ...roles("leadership", [
    ["Engineering Manager", ["engineering manager", "em"]],
    ["Head of Engineering", ["head of engineering", "vp engineering", "vp of engineering"]],
    ["CTO", ["cto", "chief technology officer"]],
    ["Head of Product", ["head of product", "vp product", "cpo"]],
    ["Head of Design", ["head of design", "design director"]],
    ["Head of Marketing", ["head of marketing", "vp marketing", "cmo"]],
    ["Creative Director", ["creative director"]],
    ["Founding Engineer", ["founding engineer"]],
  ]),
];

export function findRoleType(id: string): RoleType | undefined {
  return ROLE_CATALOG.find((r) => r.id === id);
}
