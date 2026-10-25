import { useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PluginTheme } from '@getpaseo/plugin';
import { tailwindCss } from './generated/tailwind-styles.js';
import { PortalContainerProvider } from './vendor/lib/portal-container.js';
import { isDarkTheme, themeVars } from './theme-vars.js';

/**
 * Shared Shadow DOM island host: renders a plain `<div>` in the host tree,
 * attaches an open ShadowRoot with the compiled Tailwind v4 stylesheet, and
 * mounts a separate `react-dom/client` root inside it with host theme CSS
 * variables and `PortalContainerProvider`.
 */
export function ShadowIsland({ theme, children }: { theme: PluginTheme; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
    shadow.replaceChildren();

    const style = document.createElement('style');
    style.setAttribute('data-slot', 'island-style');
    style.textContent = tailwindCss;
    shadow.appendChild(style);

    const mount = document.createElement('div');
    mount.setAttribute('data-slot', 'island-mount');
    mount.style.width = '100%';
    mount.style.height = '100%';
    shadow.appendChild(mount);
    mountRef.current = mount;

    const root = createRoot(mount);
    rootRef.current = root;

    return () => {
      root.unmount();
      rootRef.current = null;
      mountRef.current = null;
      shadow.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const mount = mountRef.current;
    if (!root || !mount) return;

    mount.classList.toggle('dark', isDarkTheme(theme));
    for (const [name, value] of Object.entries(themeVars(theme))) {
      mount.style.setProperty(name, value);
    }

    root.render(
      <PortalContainerProvider container={mount}>
        <div className='h-full w-full bg-background text-foreground'>{children}</div>
      </PortalContainerProvider>,
    );
  });

  return (
    <div
      ref={containerRef}
      style={{
        display: 'block',
        flex: '1 1 0%',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
}
