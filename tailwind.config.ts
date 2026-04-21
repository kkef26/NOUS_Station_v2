import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
        },
        ink: {
          0: "var(--ink-0)",
          1: "var(--ink-1)",
        },
        "accent-teal": "var(--accent-teal)",
        "accent-teal-dim": "var(--accent-teal-dim)",
        rogue: "var(--rogue)",
      },
    },
  },
  plugins: [],
};
export default config;
