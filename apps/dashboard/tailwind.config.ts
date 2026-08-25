import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1917",
        paper: "#faf7f2",
        accent: "#b4794e",
      },
    },
  },
  plugins: [],
} satisfies Config;
