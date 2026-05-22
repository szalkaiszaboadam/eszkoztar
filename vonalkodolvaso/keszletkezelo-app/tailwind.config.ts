import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        accent:      'var(--accent)',
        'accent-hov':'var(--accent-hover)',
        'accent-lt': 'var(--accent-light)',
        'accent-mid':'var(--accent-mid)',
        bg:          'var(--bg)',
        surface:     'var(--surface)',
        's2':        'var(--surface-2)',
        border:      'var(--border)',
        t1:          'var(--text-1)',
        t2:          'var(--text-2)',
        t3:          'var(--text-3)',
        danger:      'var(--danger)',
        'danger-bg': 'var(--danger-bg)',
        warning:     'var(--warning)',
        success:     'var(--success)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '18px',
      },
      height: {
        dvh: '100dvh',
      },
      width: {
        nav: 'var(--nav-w)',
      },
      keyframes: {
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(10px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        'fade-in':  'fade-in 0.2s ease',
        'slide-up': 'slide-up 0.2s ease',
      },
    },
  },
  plugins: [],
};

export default config;