import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070b09",
        panel: "#0d1410",
        line: "#1d2a22",
        neon: "#55f991",
        mint: "#b6ffd0"
      },
      boxShadow: {
        glow: "0 0 35px rgba(85, 249, 145, .14)"
      }
    }
  },
  plugins: []
} satisfies Config;
