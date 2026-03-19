import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f3f5f7",
        panel: "#ffffff",
        ink: "#10212b",
        accent: "#0f766e",
        warn: "#d97706",
        danger: "#b91c1c"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(16, 33, 43, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
