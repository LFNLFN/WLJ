/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF5F0',
          100: '#FFF0E0',
          200: '#FFD8B0',
          300: '#FFB880',
          400: '#F09040',
          500: '#F08020',
          600: '#D06010',
          700: '#B05000',
          800: '#904000',
          900: '#703000',
        }
      }
    },
  },
  plugins: [],
};
