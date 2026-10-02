import { ROLE_CATALOG, type Field, type Preferences, type RoleType } from "@jfa/shared";

/** All role types a profile targets, catalog and custom. */
export function targetRoles(prefs: Preferences): RoleType[] {
  return [...ROLE_CATALOG.filter((r) => prefs.roleTypeIds.includes(r.id)), ...prefs.customRoleTypes];
}

export function targetFields(prefs: Preferences): Field[] {
  return [...new Set(targetRoles(prefs).map((r) => r.field))];
}

const GENERIC_WORDS = new Set(["editor", "producer", "writer", "creator", "pm", "em", "growth", "prompt", "youtube"]);

/** Best role type for a job title, by keyword match. */
export function matchRole(title: string, roles: RoleType[]): RoleType | null {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9+#./ ]+/g, " ")} `;
  let best: { role: RoleType; score: number } | null = null;
  for (const r of roles) {
    for (const kw of [r.label.toLowerCase(), ...r.keywords]) {
      const k = kw.toLowerCase().trim();
      if (!k) continue;
      // Short or generic keywords must match as whole words.
      const hit = GENERIC_WORDS.has(k) || k.length <= 3 ? new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t) : t.includes(k);
      if (hit && (!best || k.length > best.score)) best = { role: r, score: k.length };
    }
  }
  return best?.role ?? null;
}
