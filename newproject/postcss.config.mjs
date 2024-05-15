// postcss.config.mjs

import purgecss from '@fullhuman/postcss-purgecss';

export default {
  plugins: [
    purgecss({
      content: ['./src/**/*.astro'], // Path to your Astro source files
      defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
    }),
    // Other PostCSS plugins...
  ],
};
npm create astro@latest -- --template mhyfritz/astro-landing-page