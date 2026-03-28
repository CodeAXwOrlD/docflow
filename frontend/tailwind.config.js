/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      colors: {
        surface: {
          50: "#f8f9ff",
          100: "#f0f2fe",
          200: "#e4e7fd",
          900: "#0d0f1a",
          950: "#080a12",
        },
        accent: {
          DEFAULT: "#6366f1",
          light: "#818cf8",
          dark: "#4338ca",
        },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
        "progress-bar": "progressBar 0.6s ease-out",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        progressBar: {
          "0%": { width: "0%" },
        },
      },
    },
  },
  plugins: [],
};
