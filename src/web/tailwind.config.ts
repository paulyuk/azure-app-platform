import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--bg)",
          soft: "var(--bg-soft)",
          elev: "var(--bg-elev)",
          muted: "var(--surface-muted)",
          sunken: "var(--surface-sunken)"
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
          stronger: "var(--border-stronger)"
        },
        ink: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          soft: "var(--text-soft)",
          faint: "var(--text-faint)",
          "on-accent": "var(--text-on-accent)"
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          contrast: "var(--accent-contrast)"
        },
        brand: {
          DEFAULT: "var(--brand)",
          strong: "var(--brand-strong)",
          soft: "var(--brand-soft)"
        },
        status: {
          success: "var(--success)",
          "success-soft": "var(--success-soft)",
          warning: "var(--warning)",
          "warning-soft": "var(--warning-soft)",
          danger: "var(--danger)",
          "danger-soft": "var(--danger-soft)",
          info: "var(--info)",
          "info-soft": "var(--info-soft)"
        }
      },
      borderRadius: {
        "token-xs": "var(--radius-xs)",
        "token-sm": "var(--radius-sm)",
        "token-md": "var(--radius-md)",
        "token-lg": "var(--radius-lg)",
        "token-xl": "var(--radius-xl)",
        "token-2xl": "var(--radius-2xl)",
        "token-pill": "var(--radius-pill)"
      },
      boxShadow: {
        "token-1": "var(--shadow-1)",
        "token-2": "var(--shadow-2)",
        "token-3": "var(--shadow-3)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"]
      }
    }
  },
  plugins: []
};

export default config;

