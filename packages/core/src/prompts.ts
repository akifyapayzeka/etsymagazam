import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PromptDefinition {
  id: string;
  version: number;
  tier: "cheap" | "premium";
  system: string;
  userTemplate: string;
  notes?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** packages/core/src -> repo root -> prompts/ */
const REPO_ROOT = path.resolve(__dirname, "../../../");
const PROMPTS_ROOT = process.env.PROMPTS_DIR ?? path.join(REPO_ROOT, "prompts");

const cache = new Map<string, PromptDefinition>();

/** Loads `prompts/<taskName>/v<version>.json` (defaults to the latest v1 if version omitted — callers should pin a version explicitly in real agent code). */
export async function loadPrompt(taskName: string, version = 1): Promise<PromptDefinition> {
  const cacheKey = `${taskName}@${version}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const filePath = path.join(PROMPTS_ROOT, taskName, `v${version}.json`);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as PromptDefinition;
  cache.set(cacheKey, parsed);
  return parsed;
}

/** Fills `{{variableName}}` placeholders in a prompt's userTemplate. Missing variables render as an empty string, not a literal `undefined`. */
export function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}
