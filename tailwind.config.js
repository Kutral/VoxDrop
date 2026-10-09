/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './pill.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        surface: token('surface'),
        ink: token('ink'),
        mist: token('mist'),
        line: token('line'),
        field: token('field'),
        signal: token('signal'),
        moss: token('moss'),
        brick: token('brick'),
        'on-ink': token('on-ink'),
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
      },
      // One scale, used everywhere. Nothing smaller than 12px.
      fontSize: {
        caption: ['12px', { lineHeight: '16px' }],
        body: ['14px', { lineHeight: '20px' }],
        transcript: ['17px', { lineHeight: '26px' }],
        heading: ['15px', { lineHeight: '20px', fontWeight: '600' }],
        title: ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        metric: ['28px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        chip: '6px',
        control: '8px',
        panel: '12px',
      },
    },
  },
  plugins: [],
};
