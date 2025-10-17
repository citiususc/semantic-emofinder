/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',  // Para que Tailwind escanee todos tus componentes
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};