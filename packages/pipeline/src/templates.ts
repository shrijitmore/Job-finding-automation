import type { ResumeDoc } from "./document";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function linkLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

const BASE_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: calc(10.5pt * var(--scale, 1)); }
body { font-family: "Inter", "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif; color: #1a1a1a; line-height: 1.35; padding: 13mm 14mm; }
a { color: inherit; text-decoration: none; }
h1 { font-size: 1.9rem; letter-spacing: -0.01em; line-height: 1.1; }
.headline { font-size: 1.05rem; color: #444; margin-top: 2px; }
.contact { font-size: 0.88rem; color: #444; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 0 10px; }
.contact span + span::before { content: "·"; margin-right: 10px; color: #999; }
h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); border-bottom: 1px solid #ddd; padding-bottom: 2px; margin: 11px 0 5px; }
.summary { font-size: 0.97rem; }
.role { margin-bottom: 6px; break-inside: avoid; }
.role-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
.role-sub { color: #555; font-size: 0.9rem; }
.dates { color: #555; font-weight: 400; font-size: 0.9rem; white-space: nowrap; }
ul { padding-left: 14px; margin-top: 2px; }
li { margin: 1px 0; }
.skills { font-size: 0.95rem; }
.skills b { font-weight: 600; }
.portfolio { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.95rem; }
.portfolio a { color: var(--accent); font-weight: 600; }
`;

function header(doc: ResumeDoc, withLinks: boolean): string {
  return `<header>
  <h1>${esc(doc.name)}</h1>
  ${doc.headline ? `<div class="headline">${esc(doc.headline)}</div>` : ""}
  <div class="contact">${[...doc.contactLine, ...(withLinks ? doc.portfolio.map((p) => linkLabel(p.url)) : [])]
    .map((c) => `<span>${esc(c)}</span>`)
    .join("")}</div>
</header>`;
}

function section(title: string, body: string): string {
  return body.trim() ? `<section><h2>${esc(title)}</h2>${body}</section>` : "";
}

function experience(doc: ResumeDoc): string {
  return doc.experience
    .map(
      (e) => `<div class="role">
  <div class="role-head"><span>${esc(e.title)}, ${esc(e.company)}</span><span class="dates">${esc(e.dates)}</span></div>
  ${e.location ? `<div class="role-sub">${esc(e.location)}</div>` : ""}
  ${e.bullets.length ? `<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
</div>`,
    )
    .join("");
}

function projects(doc: ResumeDoc): string {
  return doc.projects
    .map(
      (p) => `<div class="role">
  <div class="role-head"><span>${esc(p.name)}</span>${p.url ? `<span class="dates">${esc(linkLabel(p.url))}</span>` : ""}</div>
  ${p.description ? `<div class="role-sub">${esc(p.description)}</div>` : ""}
  ${p.bullets.length ? `<ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
</div>`,
    )
    .join("");
}

function skills(doc: ResumeDoc, label = "Skills"): string {
  return `<div class="skills"><b>${esc(label)}:</b> ${esc(doc.skills.join(", "))}${
    doc.alsoWorkingWith.length ? `<br><b>Also working with:</b> ${esc(doc.alsoWorkingWith.join(", "))}` : ""
  }</div>`;
}

function education(doc: ResumeDoc): string {
  return doc.education
    .map(
      (e) => `<div class="role"><div class="role-head"><span>${esc(e.degree || e.institution)}${e.degree ? `, ${esc(e.institution)}` : ""}</span><span class="dates">${esc(e.dates)}</span></div>${
        e.details ? `<div class="role-sub">${esc(e.details)}</div>` : ""
      }</div>`,
    )
    .join("");
}

function certs(doc: ResumeDoc): string {
  return doc.certifications.length ? `<div class="skills">${esc(doc.certifications.join(", "))}</div>` : "";
}

function page(body: string, accent: string, scale: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{--accent:${accent};--scale:${scale}}${BASE_CSS}</style></head><body>${body}</body></html>`;
}

/** Engineering, AI and Web3: skills up front, then experience and projects. */
function technical(doc: ResumeDoc, scale: number): string {
  return page(
    [
      header(doc, true),
      section("Summary", `<p class="summary">${esc(doc.summary)}</p>`),
      section("Skills", skills(doc, "Core")),
      section("Experience", experience(doc)),
      section("Projects", projects(doc)),
      section("Education", education(doc)),
      section("Certifications", certs(doc)),
    ].join(""),
    "#1f4fbf",
    scale,
  );
}

/** Design, video and content: portfolio links right under the name, then selected work. */
function portfolio(doc: ResumeDoc, scale: number): string {
  const links = doc.portfolio.length
    ? `<div class="portfolio">${doc.portfolio
        .map((p) => `<a href="${esc(p.url)}">${esc(p.label || p.kind)}: ${esc(linkLabel(p.url))}</a>`)
        .join("")}</div>`
    : "";
  return page(
    [
      header(doc, false),
      section("Portfolio", links),
      section("Profile", `<p class="summary">${esc(doc.summary)}</p>`),
      section("Selected work", projects(doc)),
      section("Experience", experience(doc)),
      section("Tools", skills(doc, "Tools")),
      section("Education", education(doc)),
      section("Certifications", certs(doc)),
    ].join(""),
    "#b4235a",
    scale,
  );
}

/** Product, marketing and leadership: summary and impact first, skills after. */
function impact(doc: ResumeDoc, scale: number): string {
  return page(
    [
      header(doc, true),
      section("Summary", `<p class="summary">${esc(doc.summary)}</p>`),
      section("Experience", experience(doc)),
      section("Selected projects", projects(doc)),
      section("Skills", skills(doc)),
      section("Education", education(doc)),
      section("Certifications", certs(doc)),
    ].join(""),
    "#0f766e",
    scale,
  );
}

export function renderResumeHtml(doc: ResumeDoc, scale = 1): string {
  if (doc.template === "portfolio") return portfolio(doc, scale);
  if (doc.template === "impact") return impact(doc, scale);
  return technical(doc, scale);
}
