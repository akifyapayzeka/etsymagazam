import { describe, expect, it } from "vitest";
import { loadPrompt, renderPromptTemplate } from "./prompts.js";

describe("prompt library loader", () => {
  it("loads a real versioned prompt file from the repo-root prompts/ directory", async () => {
    const prompt = await loadPrompt("seo-copywriting", 1);
    expect(prompt.id).toBe("seo-copywriting");
    expect(prompt.version).toBe(1);
    expect(prompt.userTemplate).toContain("{{productTitle}}");
  });

  it("renders template variables, defaulting missing ones to empty string", () => {
    const out = renderPromptTemplate("Hello {{name}}, you have {{count}} items and {{missing}}.", {
      name: "Sarah",
      count: "3",
    });
    expect(out).toBe("Hello Sarah, you have 3 items and .");
  });
});
