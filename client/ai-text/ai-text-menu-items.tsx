import * as React from 'react';
import { PanelLeftClose } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '../vendor/components/ui/dropdown-menu.js';
import { FileAiTextContext } from './ai-text-context.js';

export interface AiTextMenuInjectorProps {
  extraMenuItems?: React.ReactNode;
  /**
   * Hiding the original unmounts its surface. Callers must disable this when
   * unmounting could discard unsaved edits, such as a dirty editor with
   * autosave turned off.
   */
  allowHideOriginal?: boolean;
  children: (menuItems: React.ReactNode) => React.ReactNode;
}

/**
 * Adds AI Text actions to whichever viewer renders inside the split wrapper.
 * The menu items are computed here, where the AI Text context is available,
 * so callers receive a plain node (or null) instead of an always-truthy
 * element that would leave stray separators in empty menus.
 */
export function AiTextMenuInjector({
  extraMenuItems,
  allowHideOriginal = false,
  children,
}: AiTextMenuInjectorProps) {
  const aiText = React.useContext(FileAiTextContext);
  const canCloseOriginal = Boolean(
    allowHideOriginal &&
    aiText?.enabled &&
    aiText.supported &&
    aiText.isSplitOpen &&
    !aiText.isOriginalHidden,
  );

  const menuItems = canCloseOriginal ? (
    <>
      {extraMenuItems}
      {extraMenuItems ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        data-testid='ai-text-original-close-menu-item'
        onClick={() => aiText?.onHideOriginal()}
      >
        <PanelLeftClose className='size-4' />
        Close this viewer
      </DropdownMenuItem>
    </>
  ) : (
    extraMenuItems
  );

  return <>{children(menuItems)}</>;
}
