/**
 * Sistema de diseño CAVI
 * Puerto de stitch_cavi_microcr_ditos_platform/DESIGN.md
 *
 * La paleta utilitaria del diseño (green-600, slate-900, yellow-200...)
 * coincide con la paleta por defecto de Tailwind, por lo que no se duplica:
 * las utilidades `slate-*`, `green-*`, `amber-*`, `red-*` ya son las correctas.
 * Aquí se declara el nivel semántico Material 3 + tipografía + spacing + elevación.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f8f9ff",
        "surface-dim": "#cbdbf5",
        "surface-bright": "#f8f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eff4ff",
        "surface-container": "#e5eeff",
        "surface-container-high": "#dce9ff",
        "surface-container-highest": "#d3e4fe",
        "on-surface": "#0b1c30",
        "on-surface-variant": "#3e4a3d",
        "inverse-surface": "#213145",
        "inverse-on-surface": "#eaf1ff",
        outline: "#6e7b6c",
        "outline-variant": "#bdcaba",
        "surface-tint": "#006e2d",
        primary: {
          DEFAULT: "#006b2c",
          container: "#00873a",
          fixed: "#7ffc97",
          "fixed-dim": "#62df7d",
        },
        "on-primary": "#ffffff",
        "on-primary-container": "#f7fff2",
        "inverse-primary": "#62df7d",
        secondary: {
          DEFAULT: "#565e74",
          container: "#dae2fd",
          fixed: "#dae2fd",
          "fixed-dim": "#bec6e0",
        },
        "on-secondary": "#ffffff",
        "on-secondary-container": "#5c647a",
        tertiary: {
          DEFAULT: "#755800",
          container: "#936f00",
          fixed: "#ffdf9a",
          "fixed-dim": "#f7be1d",
        },
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#fffbff",
        "on-primary-fixed": "#002109",
        "on-primary-fixed-variant": "#005320",
        "on-secondary-fixed": "#131b2e",
        "on-secondary-fixed-variant": "#3f465c",
        "on-tertiary-fixed": "#251a00",
        "on-tertiary-fixed-variant": "#5a4300",
        error: {
          DEFAULT: "#ba1a1a",
          container: "#ffdad6",
        },
        "on-error": "#ffffff",
        "on-error-container": "#93000a",
        background: "#f8f9ff",
        "on-background": "#0b1c30",
        "surface-variant": "#d3e4fe",
      },
      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        "headline-xl": ["2rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em", fontWeight: "700" }],
        "headline-lg": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-md": ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-sm": ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg": ["1rem", { lineHeight: "1.5rem" }],
        "body-md": ["0.875rem", { lineHeight: "1.25rem" }],
        "body-sm": ["0.75rem", { lineHeight: "1rem" }],
        "data-metric": ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        "data-tabular": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500" }],
        "label-md": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500" }],
        "label-sm": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.025em", fontWeight: "600" }],
        "label-xs": ["0.6875rem", { lineHeight: "0.875rem", letterSpacing: "0.05em", fontWeight: "600" }],
      },
      spacing: {
        gutter: "1.5rem",
        "gutter-mobile": "1rem",
        margin: "2rem",
        "margin-mobile": "1rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04)",
        popover: "0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)",
        modal: "0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "zoom-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "zoom-in": "zoom-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
}
