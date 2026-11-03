import type { Config } from "tailwindcss";

// Colours come from CSS variables (see app/globals.css) so light/dark just work.
// Pages mostly use the hand-written classes in globals.css; Tailwind is kept for spacing/layout helpers.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: "var(--surface)",
        slate: {
          50: "var(--surface-2)",
          100: "var(--surface-2)",
          200: "var(--line)",
          300: "var(--line-2)",
          400: "var(--fg-3)",
          500: "var(--fg-2)",
          600: "var(--fg-2)",
          700: "var(--fg)",
          800: "var(--fg)",
          900: "var(--fg)",
        },
        brand: {
          50: "var(--accent-soft)",
          100: "var(--accent-soft)",
          500: "var(--accent)",
          600: "var(--accent)",
          700: "var(--accent)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
