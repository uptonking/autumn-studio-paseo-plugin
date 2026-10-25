// Shared host props fixture for the runtime test scripts.
export const hostProps = {
  host: { id: 'host-1', label: 'Local' },
  theme: {
    colors: {
      surface0: '#ffffff',
      surface1: '#f4f4f5',
      surface2: '#e4e4e7',
      border: '#dddddd',
      foreground: '#18181b',
      foregroundMuted: '#71717a',
      accent: '#2563eb',
      accentForeground: '#ffffff',
      statusSuccess: '#22c55e',
      statusWarning: '#f59e0b',
      statusDanger: '#ef4444',
    },
  },
  layout: { compact: false, platform: 'web' },
};
