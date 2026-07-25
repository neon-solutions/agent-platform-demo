/**
 * The Neon agent skills, bundled for the coding agent.
 *
 * The same skills a human uses in this repo (`.agents/skills/`) are handed to
 * the coding agent, so it generates apps against the documented Neon
 * primitives — Postgres, Functions, Object Storage, AI Gateway — instead of
 * whatever it remembers about them. Skills are surfaced as a short catalog in
 * the system prompt plus a `readSkill` tool, so the agent pays for the full
 * text only when it actually needs a primitive.
 */
import { GENERATED_SKILLS } from "./generated";
import type { Skill } from "./types";

export type { Skill };

export const SKILLS: Readonly<Record<string, Skill>> = GENERATED_SKILLS;

export const SKILL_NAMES: readonly string[] = Object.keys(GENERATED_SKILLS);

export function getSkill(name: string): Skill | undefined {
  return Object.hasOwn(GENERATED_SKILLS, name) ? GENERATED_SKILLS[name] : undefined;
}

/** Every readable path for a skill, e.g. `SKILL.md`, `references/sse.md`. */
export function skillFilePaths(name: string): readonly string[] {
  const skill = getSkill(name);
  return skill === undefined ? [] : Object.keys(skill.files);
}

export interface SkillReadError {
  ok: false;
  error: string;
}

export interface SkillReadResult {
  ok: true;
  name: string;
  path: string;
  content: string;
}

/**
 * Read one file out of a skill. Returns a result rather than throwing so the
 * agent's tool layer can hand the agent a correctable message (with the valid
 * options) instead of failing the turn.
 */
export function readSkillFile(name: string, path = "SKILL.md"): SkillReadResult | SkillReadError {
  const skill = getSkill(name);
  if (skill === undefined) {
    return { ok: false, error: `Unknown skill "${name}". Available: ${SKILL_NAMES.join(", ")}.` };
  }
  const content = Object.hasOwn(skill.files, path) ? skill.files[path] : undefined;
  if (content === undefined) {
    return {
      ok: false,
      error: `Skill "${name}" has no file "${path}". Available: ${Object.keys(skill.files).join(", ")}.`,
    };
  }
  return { ok: true, name, path, content };
}

/**
 * A compact catalog for the system prompt: one bullet per skill with its
 * description and any reference files, so the agent knows what it can pull in.
 */
export function skillCatalog(): string {
  return Object.values(GENERATED_SKILLS)
    .map((skill) => {
      const description = skill.description.replace(/\s+/g, " ").trim();
      const references = Object.keys(skill.files).filter((p) => p !== "SKILL.md");
      const extra = references.length > 0 ? ` Reference files: ${references.join(", ")}.` : "";
      return `- **${skill.name}** — ${description}${extra}`;
    })
    .join("\n");
}
