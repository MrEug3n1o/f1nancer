export interface Palette {
  bg: string; elevated: string; card: string; input: string; ink: string; muted: string;
  line: string; accent: string; accentBright: string; accentSoft: string; danger: string;
  dangerSoft: string; dangerBg: string; income: string; expense: string; track: string;
  sidebar: string; sidebarText: string; sidebarMuted: string; sidebarLine: string; shadow: string;
}

export const colors: Palette = {
  bg: "#f3efe6", elevated: "#fffaf2", card: "#ffffff", input: "#ffffff",
  ink: "#1c2a1f", muted: "#5f6d62", line: "#d8d0c2", accent: "#2f6b4f",
  accentBright: "#6ec394", accentSoft: "#dcefe4", danger: "#a33b3b",
  dangerSoft: "#e7bcbc", dangerBg: "#f8e6e6", income: "#1f7a4c", expense: "#a33b3b",
  track: "#ebe4d7", sidebar: "#1c2a1f", sidebarText: "#e8efe9",
  sidebarMuted: "#9fb0a2", sidebarLine: "#34463a", shadow: "#1c2a1f",
};

export const darkColors: Palette = {
  bg: "#121416", elevated: "#1e2228", card: "#1c2026", input: "#15181c",
  ink: "#e8eaed", muted: "#9aa3ad", line: "#2e343c", accent: "#4f9d74",
  accentBright: "#6ec394", accentSoft: "#1b2a22", danger: "#e07a7a",
  dangerSoft: "#6e3a3e", dangerBg: "#3a2224", income: "#5fbf8c", expense: "#e07a7a",
  track: "#2e343c", sidebar: "#0c0e10", sidebarText: "#e8eaed",
  sidebarMuted: "#89938d", sidebarLine: "#272d2a", shadow: "#000000",
};
