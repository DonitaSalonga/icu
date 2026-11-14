import preset from '@icu/ui-tokens/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./entrypoints/**/*.{html,ts,tsx}', './lib/**/*.{ts,tsx}'],
};
