// Tailwind 3 preset mapping docs/DSD.md tokens (CSS variables in tokens.css) into the theme.
/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        primary: { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)', on: 'var(--color-on-primary)' },
        risk: {
          'low-bg': 'var(--color-risk-low-bg)',
          'low-fg': 'var(--color-risk-low-fg)',
          'med-bg': 'var(--color-risk-med-bg)',
          'med-fg': 'var(--color-risk-med-fg)',
          'high-bg': 'var(--color-risk-high-bg)',
          'high-fg': 'var(--color-risk-high-fg)',
        },
        danger: 'var(--color-danger)',
        gap: 'var(--color-gap)',
        success: 'var(--color-success)',
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['18px', '28px'],
        xl: ['24px', '32px'],
        code: ['20px', { lineHeight: '28px', fontWeight: '600' }],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)', 3: 'var(--shadow-3)' },
    },
  },
};
