import { createContext, useContext, type ReactNode } from "react"

/**
 * Base UI portals render into document.body by default, which sits outside the
 * island's shadow root — popovers, menus, dialogs and selects would lose every
 * Tailwind style. Portal-capable vendored components read this context and
 * default their `container` prop to it.
 */
export const PortalContainerContext = createContext<HTMLElement | ShadowRoot | null>(null)

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | ShadowRoot | null
  children: ReactNode
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  )
}

export function usePortalContainer(): HTMLElement | ShadowRoot | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
