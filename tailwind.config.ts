import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#090a0f',
        foreground: '#f3f4f6',
        card: '#11131a',
        'card-border': '#1f2430',
        muted: '#8e96a8',
      },
      typography: {
        invert: {
          css: {
            '--tw-prose-body': '#d1d5db',
            '--tw-prose-headings': '#f9fafb',
            '--tw-prose-lead': '#9ca3af',
            '--tw-prose-links': '#60a5fa',
            '--tw-prose-bold': '#ffffff',
            '--tw-prose-counters': '#9ca3af',
            '--tw-prose-bullets': '#4b5563',
            '--tw-prose-hr': '#1f2937',
            '--tw-prose-quotes': '#f3f4f6',
            '--tw-prose-quote-borders': '#374151',
            '--tw-prose-captions': '#9ca3af',
            '--tw-prose-code': '#e5e7eb',
            '--tw-prose-pre-code': '#d1d5db',
            '--tw-prose-pre-bg': '#111827',
            '--tw-prose-th-borders': '#374151',
            '--tw-prose-td-borders': '#1f2937',
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
