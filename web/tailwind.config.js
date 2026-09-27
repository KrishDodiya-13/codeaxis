/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Landing poster palette; matches MascotPortfolioHero's paper / ink / accent defaults.
        poster: {
          paper: '#ebebea',
          ink: '#111111',
          green: '#5fb57a',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-archivo-black)', 'Arial Black', 'sans-serif'],
      },
      keyframes: {
        // Hand-drawn stroke reveal, same as the hero's swash. Paths use pathLength={1}.
        draw: {
          from: { strokeDashoffset: '1' },
          to: { strokeDashoffset: '0' },
        },
        // The hero's tag wiggle.
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-12deg)' },
          '55%': { transform: 'rotate(8deg)' },
          '80%': { transform: 'rotate(-4deg)' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        // Indeterminate progress bar: a segment sweeping across while a model call runs.
        sweep: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(350%)' },
        },
        // The AI reasoning column arriving: it grows in from the right edge (so the main
        // panel narrows smoothly instead of snapping), overshoots left, and settles.
        'reasoning-in': {
          '0%': { width: '0', minWidth: '0', opacity: '0', transform: 'translateX(80px)' },
          '55%': { width: '29.5%', minWidth: '300px', opacity: '1', transform: 'translateX(-16px)' },
          '72%': { transform: 'translateX(7px)' },
          '86%': { transform: 'translateX(-3px)' },
          '100%': { width: '29.5%', minWidth: '300px', opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        draw: 'draw 1.6s 0.4s cubic-bezier(.6,0,.2,1) both',
        wiggle: 'wiggle 0.9s cubic-bezier(.3,1.6,.5,1)',
        bob: 'bob 3.2s ease-in-out infinite',
        sweep: 'sweep 1.4s cubic-bezier(.6,0,.2,1) infinite',
        'reasoning-in': 'reasoning-in 0.85s cubic-bezier(.25,.8,.35,1) both',
        'spin-slow': 'spin 22s linear infinite',
        'spin-slower': 'spin 36s linear infinite reverse',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
