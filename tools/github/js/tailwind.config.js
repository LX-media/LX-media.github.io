export const config = {
  darkMode: "class",
  content: ["./**/*.{html,js}"],
  theme: {
    extend: {
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      colors: {
        // Add commonly used colors for easier reference
        'filter-active': 'rgb(219, 234, 254)',
        'filter-active-dark': 'rgb(30, 58, 138)',
      },
    },
  },
  plugins: [],
};
