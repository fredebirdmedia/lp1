import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const purgecss = require('@fullhuman/postcss-purgecss')({
  content: ['./src/**/*.astro'],
  defaultExtractor: content => content.match(/[A-Za-z0-9-_:/]+/g) || []
});

export default {
  // You may add more plugins here
  postcss: {
    plugins: [
      tailwindcss,
      autoprefixer,
      ...(process.env.NODE_ENV === 'production' ? [purgecss] : [])
    ]
  },
};
