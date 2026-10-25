import type { PluginTheme } from '@getpaseo/plugin';

/**
 * The vendored components read shadcn's semantic CSS variables. Mapping the
 * host theme onto those variables keeps the island on Paseo's actual palette
 * for every host theme, light or dark, instead of shipping a second palette.
 *
 * The `--color-*` entries matter for dependencies that inject their own
 * stylesheets (@pierre/trees) and reference Tailwind's theme variables
 * directly; `@theme inline` never emits those custom properties, so the
 * island provides them at runtime on the mount node.
 */
export function themeVars(theme: PluginTheme): Record<string, string> {
  const c = theme.colors;
  const base: Record<string, string> = {
    '--background': c.surface0,
    '--foreground': c.foreground,
    '--card': c.surface1,
    '--card-foreground': c.foreground,
    '--popover': c.surface1,
    '--popover-foreground': c.foreground,
    '--primary': c.accent,
    '--primary-foreground': c.accentForeground,
    '--secondary': c.surface2,
    '--secondary-foreground': c.foreground,
    '--muted': c.surface1,
    '--muted-foreground': c.foregroundMuted,
    '--accent': c.surface2,
    '--accent-foreground': c.foreground,
    '--destructive': c.statusDanger,
    '--destructive-foreground': '#ffffff',
    '--border': c.border,
    '--input': c.border,
    '--ring': c.accent,
    '--radius': '0.625rem',
    '--sidebar': c.surface1,
    '--sidebar-foreground': c.foreground,
    '--sidebar-primary': c.accent,
    '--sidebar-primary-foreground': c.accentForeground,
    '--sidebar-accent': c.surface2,
    '--sidebar-accent-foreground': c.foreground,
    '--sidebar-border': c.border,
    '--sidebar-ring': c.accent,
    '--warning': c.statusWarning,
    '--warning-foreground': '#000000',
    '--success': c.statusSuccess,
    '--success-foreground': '#000000',
    '--info': c.accent,
    '--info-foreground': '#ffffff',
    '--surface': c.surface1,
    '--surface-foreground': c.foreground,
    '--code': c.surface2,
    '--code-foreground': c.foreground,
    '--selection': c.accent,
    '--selection-foreground': c.accentForeground,
  };

  const themeColor = (name: string): string | undefined => {
    const value = base[name];
    return value === undefined ? undefined : `var(${name})`;
  };

  // Tailwind v4 theme variable names, pointing at the base variables above so
  // everything re-resolves together on the mount node.
  for (const name of [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--destructive-foreground',
    '--border',
    '--input',
    '--ring',
    '--sidebar',
    '--sidebar-foreground',
    '--sidebar-primary',
    '--sidebar-primary-foreground',
    '--sidebar-accent',
    '--sidebar-accent-foreground',
    '--sidebar-border',
    '--sidebar-ring',
    '--surface',
    '--surface-foreground',
    '--code',
    '--code-foreground',
    '--selection',
    '--selection-foreground',
    '--warning',
    '--warning-foreground',
    '--success',
    '--success-foreground',
    '--info',
    '--info-foreground',
  ]) {
    const value = themeColor(name);
    if (value) base[`--color-${name.slice(2)}`] = value;
  }

  return base;
}

/**
 * Drives Tailwind's `dark:` variants. The host theme carries no appearance
 * flag, so compare the perceived luminance of foreground against surface.
 */
export function isDarkTheme(theme: PluginTheme): boolean {
  const bg = luminance(theme.colors.surface0);
  const fg = luminance(theme.colors.foreground);
  if (bg === null || fg === null) return false;
  return fg > bg;
}

function luminance(color: string): number | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function parseRgb(color: string): [number, number, number] | null {
  const hex = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  if (short) {
    return [
      parseInt(short[1][0] + short[1][0], 16),
      parseInt(short[1][1] + short[1][1], 16),
      parseInt(short[1][2] + short[1][2], 16),
    ];
  }
  const long = /^#([0-9a-f]{6})$/i.exec(hex);
  if (long) {
    return [
      parseInt(long[1].slice(0, 2), 16),
      parseInt(long[1].slice(2, 4), 16),
      parseInt(long[1].slice(4, 6), 16),
    ];
  }
  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(hex);
  if (fn) {
    return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  }
  return null;
}
