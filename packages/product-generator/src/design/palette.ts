export interface Palette {
  id: string;
  name: string;
  background: string;
  surface: string;
  ink: string;
  inkMuted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
}

/** Curated, deterministic palette+type pairings — no AI involved in choosing these. */
export const PALETTES: Record<string, Palette> = {
  wildflower: {
    id: "wildflower",
    name: "Wildflower Neutral",
    background: "#FAF6F1",
    surface: "#FFFFFF",
    ink: "#2E2A25",
    inkMuted: "#8A8175",
    accent: "#B4794E",
    headingFont: "Playfair Display",
    bodyFont: "Jost",
  },
  sage: {
    id: "sage",
    name: "Sage Wedding",
    background: "#F1F4EE",
    surface: "#FFFFFF",
    ink: "#33402F",
    inkMuted: "#7C8873",
    accent: "#6B7F5C",
    headingFont: "Cormorant Garamond",
    bodyFont: "Jost",
  },
  blush: {
    id: "blush",
    name: "Blush Romance",
    background: "#FBF1EF",
    surface: "#FFFFFF",
    ink: "#3B2C2A",
    inkMuted: "#9C7E7A",
    accent: "#C97B72",
    headingFont: "Playfair Display",
    bodyFont: "Jost",
  },
  minimal: {
    id: "minimal",
    name: "Minimal Mono",
    background: "#FFFFFF",
    surface: "#F5F5F4",
    ink: "#111111",
    inkMuted: "#6B6B6B",
    accent: "#111111",
    headingFont: "Jost",
    bodyFont: "Jost",
  },
};

export function resolvePalette(id: string | undefined): Palette {
  return PALETTES[id ?? "wildflower"] ?? (PALETTES.wildflower as Palette);
}

export function listPaletteIds(): string[] {
  return Object.keys(PALETTES);
}
