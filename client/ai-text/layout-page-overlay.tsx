import * as React from "react";
import type {
  AiTextLayoutBlock,
  AiTextLayoutDocument,
} from "../../shared/contracts.js";
import { cn } from "../vendor/lib/utils.js";

export interface LayoutPageOverlayProps {
  pageNumber: number;
  layout: AiTextLayoutDocument;
  activeBlock: AiTextLayoutBlock | null;
  showOutlines: boolean;
}

const OUTLINE_CLASS =
  "absolute rounded-[2px] border border-sky-500/35 bg-sky-400/5";
const ACTIVE_CLASS =
  "absolute rounded-[2px] border border-amber-500 bg-amber-400/25 ring-1 ring-amber-500/70";

/**
 * Percentage-positioned boxes over one rendered PDF page. Pointer events stay
 * disabled so selection, links, and the editor keep receiving input.
 */
export function LayoutPageOverlay({
  pageNumber,
  layout,
  activeBlock,
  showOutlines,
}: LayoutPageOverlayProps) {
  const blocks = React.useMemo(
    () => layout.blocks.filter((block) => block.pageNumber === pageNumber),
    [layout, pageNumber],
  );
  if (blocks.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      data-testid={`ai-text-layout-overlay-${pageNumber}`}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {blocks.map((block) => {
        const isActive = block.id === activeBlock?.id;
        if (!isActive && !showOutlines) return null;
        const [x0, y0, x1, y1] = block.bbox;
        const width = x1 - x0;
        const height = y1 - y0;
        if (width <= 0 || height <= 0) return null;
        return (
          <div
            key={block.id}
            data-testid={`ai-text-layout-box-${block.id}`}
            style={{
              left: `${x0 * 100}%`,
              top: `${y0 * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
            }}
            className={cn(isActive ? ACTIVE_CLASS : OUTLINE_CLASS)}
          >
            {isActive ? (
              <span className="absolute -top-4 left-0 rounded-sm bg-amber-500 px-1 py-0.5 text-[9px] font-medium leading-none text-white">
                {block.type}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
