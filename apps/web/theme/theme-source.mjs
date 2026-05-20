export const themeSections = [
  {
    title: 'Surfaces',
    tokens: {
      '--color-background': '#17131c',
      '--color-surface': '#231b2d',
      '--color-surface-strong': '#2b2137',
      '--color-surface-inverse': '#f8f4ff',
      '--color-overlay': '#0a070fb8',
    },
  },
  {
    title: 'Text',
    tokens: {
      '--color-text': '#f5efff',
      '--color-muted-text': '#cbbfe0',
      '--color-control-text': '#ebe1fb',
      '--color-icon': '#b09ccf',
      '--color-text-inverse': '#1a1520',
    },
  },
  {
    title: 'Structure',
    tokens: {
      '--color-border': '#312547',
    },
  },
  {
    title: 'Primary actions',
    tokens: {
      '--color-action': '#f8f4ff',
      '--color-action-strong': '#ffffff',
      '--color-action-hover': '#ffffff',
      '--color-on-action': '#1a1520',
    },
  },
  {
    title: 'Accents',
    tokens: {
      '--color-accent': '#bfa7df',
      '--color-accent-strong': '#9270c2',
      '--color-brand-mark': '#5d457e',
      '--color-scanner-frame': '#bfa7df',
    },
  },
  {
    title: 'Status',
    tokens: {
      '--color-danger': '#ff8f97',
      '--color-danger-strong': '#ff7e88',
      '--color-on-danger': '#2a0c12',
      '--color-success': '#7fd4a5',
      '--color-warning': '#f1c979',
    },
  },
  {
    title: 'Scale',
    tokens: {
      '--shadow-panel': 'none',
      '--radius-sm': '6px',
      '--radius-md': '8px',
      '--space-1': '0.25rem',
      '--space-2': '0.5rem',
      '--space-3': '0.75rem',
      '--space-4': '1rem',
      '--space-5': '1.5rem',
      '--space-6': '2rem',
      '--font-body': 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      '--focus-ring': '0 0 0 3px rgb(191 167 223 / 30%)',
    },
  },
];

const themeTokenMap = new Map(
  themeSections.flatMap((section) => Object.entries(section.tokens)),
);

export function getThemeToken(tokenName) {
  const tokenValue = themeTokenMap.get(tokenName);

  if (!tokenValue) {
    throw new Error(`Unknown theme token: ${tokenName}`);
  }

  return tokenValue;
}