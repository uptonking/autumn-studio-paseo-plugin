"use client";

import * as React from "react";
import type { XlsxCellStyleInput } from "@extend-ai/react-xlsx";
import { Grid2x2, PaintBucket, Type } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";

export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200] as const;
export const FONT_FAMILIES = [
  "Arial",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Helvetica",
  "Courier New",
] as const;
export const FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36,
] as const;
export const NUMBER_FORMAT_PRESETS = [
  { id: "general", label: "General", formatString: "General" },
  { id: "number", label: "Number", formatString: "#,##0.00" },
  { id: "integer", label: "Integer", formatString: "#,##0" },
  { id: "currency", label: "Currency", formatString: "$#,##0.00" },
  { id: "percent", label: "Percent", formatString: "0.0%" },
  { id: "date", label: "Date", formatString: "yyyy-mm-dd" },
] as const;

export const TEXT_COLOR_SWATCHES = [
  { label: "Default", hex: "#111827", rgb: "111827" },
  { label: "Blue", hex: "#2563EB", rgb: "2563EB" },
  { label: "Emerald", hex: "#059669", rgb: "059669" },
  { label: "Amber", hex: "#D97706", rgb: "D97706" },
  { label: "Red", hex: "#DC2626", rgb: "DC2626" },
] as const;

export const FILL_COLOR_SWATCHES = [
  { label: "None", hex: "transparent", rgb: "" },
  { label: "Soft Yellow", hex: "#FEF3C7", rgb: "FEF3C7" },
  { label: "Soft Green", hex: "#D1FAE5", rgb: "D1FAE5" },
  { label: "Soft Blue", hex: "#DBEAFE", rgb: "DBEAFE" },
  { label: "Soft Rose", hex: "#FFE4E6", rgb: "FFE4E6" },
] as const;

export interface CellStyleSnapshot {
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: string;
    strikethrough?: boolean;
  };
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  };
  numberFormat?: {
    formatType?: string;
    formatString?: string;
  };
}

export interface WorksheetWithCellStyleReader {
  getCellStyleAt?: (row: number, col: number) => CellStyleSnapshot | null;
  getDefaultStyle?: (row: number, col: number) => CellStyleSnapshot | null;
}

export function ToolbarIconButton({
  active = false,
  children,
  disabled,
  label,
  onClick,
  testId,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-secondary text-foreground shadow-2xs ring-1 ring-border/70"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function XlsxColorAndBorderMenus({
  applyStyle,
  canStyle,
}: {
  applyStyle: (style: XlsxCellStyleInput) => void;
  canStyle: boolean;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="xlsx-text-color-trigger"
            title="Text color"
            disabled={!canStyle}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Type className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 p-1.5">
          <div className="px-1.5 py-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Text color
          </div>
          {TEXT_COLOR_SWATCHES.map((swatch) => (
            <DropdownMenuItem
              key={swatch.label}
              onClick={() =>
                applyStyle({
                  font: {
                    color: { colorType: "rgb", hex: swatch.rgb },
                  },
                })
              }
            >
              <span
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: swatch.hex }}
              />
              <span>{swatch.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="xlsx-fill-color-trigger"
            title="Fill color"
            disabled={!canStyle}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <PaintBucket className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 p-1.5">
          <div className="px-1.5 py-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Cell fill
          </div>
          {FILL_COLOR_SWATCHES.map((swatch) => (
            <DropdownMenuItem
              key={swatch.label}
              onClick={() =>
                applyStyle({
                  fill: swatch.rgb
                    ? {
                        fillType: "solid",
                        color: { colorType: "rgb", hex: swatch.rgb },
                      }
                    : { fillType: "none" },
                })
              }
            >
              <span
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: swatch.hex }}
              />
              <span>{swatch.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function XlsxBorderDropdownMenu({
  applyStyle,
  canStyle,
}: {
  applyStyle: (style: XlsxCellStyleInput) => void;
  canStyle: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="xlsx-border-trigger"
          title="Cell borders"
          disabled={!canStyle}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Grid2x2 className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 p-1.5">
        <DropdownMenuItem
          onClick={() => {
            const edge = {
              style: "thin" as const,
              color: { colorType: "rgb" as const, hex: "9CA3AF" },
            };
            applyStyle({
              border: { left: edge, right: edge, top: edge, bottom: edge },
            });
          }}
        >
          <span>All borders</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const edge = {
              style: "thin" as const,
              color: { colorType: "rgb" as const, hex: "6B7280" },
            };
            applyStyle({
              border: { top: edge },
            });
          }}
        >
          <span>Top border</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const edge = {
              style: "medium" as const,
              color: { colorType: "rgb" as const, hex: "4B5563" },
            };
            applyStyle({
              border: { bottom: edge },
            });
          }}
        >
          <span>Bottom border</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const edge = {
              style: "thin" as const,
              color: { colorType: "rgb" as const, hex: "6B7280" },
            };
            applyStyle({
              border: { left: edge },
            });
          }}
        >
          <span>Left border</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const edge = {
              style: "thin" as const,
              color: { colorType: "rgb" as const, hex: "6B7280" },
            };
            applyStyle({
              border: { right: edge },
            });
          }}
        >
          <span>Right border</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const noneEdge = { style: "none" as const };
            applyStyle({
              border: {
                left: noneEdge,
                right: noneEdge,
                top: noneEdge,
                bottom: noneEdge,
              },
            });
          }}
        >
          <span>Clear borders</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
