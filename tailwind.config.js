/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F7F1E6",
        ivory: "#FFFBF3",
        ink: "#2B2118",
        soft: "#6B5A4A",
        terra: "#C8643B",
        amber: "#E0A33A",
        sage: "#7A8F6B",
        brick: "#B5443A",
        line: "rgba(43,33,24,0.12)",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(43,33,24,0.04), 0 18px 40px -22px rgba(43,33,24,0.28)",
        lift: "0 2px 0 rgba(43,33,24,0.05), 0 34px 60px -28px rgba(43,33,24,0.4)",
      },
    },
  },
  plugins: [],
};
