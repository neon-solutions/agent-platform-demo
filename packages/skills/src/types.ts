/** A vendored Neon agent skill: its frontmatter plus every markdown file it ships. */
export interface Skill {
  name: string;
  description: string;
  /** Keyed by path relative to the skill directory; always includes `SKILL.md`. */
  files: Record<string, string>;
}
