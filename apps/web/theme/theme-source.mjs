export const themeSections = [
  {
    title: 'Base colors',
    tokens: {
      '--color-background': '#312a53',
      '--color-text': '#fff8f0',
      '--color-accent': '#f39442',
      '--color-danger': '#ff8f97',
      '--color-success': '#7fd4a5',
      '--color-warning': '#f3c36b',
    },
  },
  {
    title: 'Derived colors',
    tokens: {
      '--color-surface': 'color-mix(in srgb, var(--color-background) 94%, var(--color-text) 6%)',
      '--color-surface-strong':
        'color-mix(in srgb, var(--color-background) 86%, var(--color-text) 14%)',
      '--color-muted-text':
        'color-mix(in srgb, var(--color-text) 85%, var(--color-background) 15%)',
      '--color-border': 'color-mix(in srgb, var(--color-background) 76%, var(--color-text) 24%)',
      '--color-accent-strong': 'color-mix(in srgb, var(--color-accent) 82%, var(--color-text) 18%)',
      '--color-danger-strong':
        'color-mix(in srgb, var(--color-danger) 88%, var(--color-background) 12%)',
      '--color-overlay': 'color-mix(in srgb, var(--color-background) 78%, transparent)',
    },
  },
  {
    title: 'Scale',
    tokens: {
      '--shadow-panel': 'none',
      '--radius-sm': '8px',
      '--radius-md': '12px',
      '--space-1': '0.25rem',
      '--space-2': '0.5rem',
      '--space-3': '0.75rem',
      '--space-4': '1rem',
      '--space-5': '1.5rem',
      '--space-6': '2rem',
      '--font-body':
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      '--focus-ring': '0 0 0 3px color-mix(in srgb, var(--color-accent) 38%, transparent)',
    },
  },
];
