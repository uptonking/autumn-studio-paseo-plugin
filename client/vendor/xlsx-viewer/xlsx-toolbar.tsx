"use client";

import * as React from "react";
import {
  useXlsxViewer,
  useXlsxViewerEditing,
  useXlsxViewerSelection,
  useXlsxViewerZoom,
  type XlsxCellStyleInput,
} from "@extend-ai/react-xlsx";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  Italic,
  Merge,
  MoreHorizontal,
  Redo2,
  Split,
  Strikethrough,
  Underline,
  Undo2,
  WrapText,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  EditorSaveControls,
  SurfaceModeSwitcher,
} from "../../editing/surface-mode-controls";
import type { FileEditSession } from "../../editing/use-file-edit-session";
import type { FileSurfaceRole } from "../../viewers/provider-catalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  FONT_FAMILIES,
  FONT_SIZE_PRESETS,
  NUMBER_FORMAT_PRESETS,
  ToolbarIconButton,
  XlsxBorderDropdownMenu,
  XlsxColorAndBorderMenus,
  ZOOM_PRESETS,
  type WorksheetWithCellStyleReader,
} from "./xlsx-toolbar-menus";
import { WorkbookSearchPopover } from "./xlsx-search-popover";

export interface XlsxToolbarProps {
  role: FileSurfaceRole;
  canSwitchRole?: boolean;
  onRoleChange?: (role: FileSurfaceRole) => void;
  onPreloadRole?: (role: FileSurfaceRole) => void;
  editSession?: FileEditSession;
  showDownloadButton: boolean;
  searchOpenRequest?: number;
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

export function XlsxToolbar({
  role,
  canSwitchRole = true,
  onRoleChange,
  onPreloadRole,
  editSession,
  showDownloadButton,
  searchOpenRequest = 0,
  viewportRef,
  extraMenuItems,
  toolbarActions,
}: XlsxToolbarProps) {
  const {
    activeSheetIndex,
    canExport,
    exportCsv,
    exportXlsx,
    getActiveWorksheet,
    revision,
    setActiveSheetIndex,
    sheets,
  } = useXlsxViewer();
  const { activeCell, selection } = useXlsxViewerSelection();
  const {
    canRedo,
    canUndo,
    mergeSelection,
    readOnly,
    redo,
    setCellStyle,
    setRangeStyle,
    setSelectedCellStyle,
    undo,
    unmergeSelection,
  } = useXlsxViewerEditing();
  const { canZoomIn, canZoomOut, setZoomScale, zoomIn, zoomOut, zoomScale } =
    useXlsxViewerZoom();

  const isEditor = role === "editor" && !readOnly;
  const currentZoom = Math.round(zoomScale);
  const canStyle = isEditor && Boolean(activeCell || selection);

  const activeCellStyle = React.useMemo(() => {
    void revision;
    if (!activeCell) {
      return null;
    }
    const worksheet =
      getActiveWorksheet() as WorksheetWithCellStyleReader | null;
    return (
      worksheet?.getCellStyleAt?.(activeCell.row, activeCell.col) ??
      worksheet?.getDefaultStyle?.(activeCell.row, activeCell.col) ??
      null
    );
  }, [activeCell, getActiveWorksheet, revision]);

  const currentFontFamily = activeCellStyle?.font?.name?.trim() || "Arial";
  const currentFontSize = Math.round(activeCellStyle?.font?.size || 11);
  const isBold = Boolean(activeCellStyle?.font?.bold);
  const isItalic = Boolean(activeCellStyle?.font?.italic);
  const isUnderline = Boolean(
    activeCellStyle?.font?.underline &&
      activeCellStyle.font.underline !== "none",
  );
  const isStrike = Boolean(activeCellStyle?.font?.strikethrough);
  const currentAlign = activeCellStyle?.alignment?.horizontal ?? null;
  const currentVerticalAlign = activeCellStyle?.alignment?.vertical ?? "bottom";
  const isWrapText = Boolean(activeCellStyle?.alignment?.wrapText);
  const currentNumberFormatId = React.useMemo(() => {
    const fmt = activeCellStyle?.numberFormat?.formatString ?? "General";
    return (
      NUMBER_FORMAT_PRESETS.find((preset) => preset.formatString === fmt)?.id ??
      "general"
    );
  }, [activeCellStyle?.numberFormat?.formatString]);

  const applyStyle = React.useCallback(
    (style: XlsxCellStyleInput) => {
      if (!isEditor) {
        return;
      }
      if (selection || activeCell) {
        setSelectedCellStyle(style);
        return;
      }
      if (selection) {
        setRangeStyle(selection, style);
        return;
      }
      if (activeCell) {
        setCellStyle(activeCell, style);
      }
    },
    [
      activeCell,
      isEditor,
      selection,
      setCellStyle,
      setRangeStyle,
      setSelectedCellStyle,
    ],
  );

  const hasMoreMenu = showDownloadButton || Boolean(extraMenuItems);

  return (
    <div
      data-testid="xlsx-toolbar"
      className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-border/70 bg-background px-2.5 py-1 text-xs select-none"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {sheets.length > 1 ? (
          <select
            aria-label="Active worksheet"
            data-testid="xlsx-sheet-select"
            value={String(activeSheetIndex)}
            onChange={(event) =>
              setActiveSheetIndex(Number(event.target.value))
            }
            className="h-7 max-w-[140px] truncate rounded-md border border-border/80 bg-muted/40 px-2 text-xs font-medium text-foreground outline-none hover:bg-muted/70"
          >
            {sheets.map((sheet, idx) => (
              <option
                key={`${sheet.workbookSheetIndex}-${sheet.name}`}
                value={idx}
              >
                {sheet.name}
              </option>
            ))}
          </select>
        ) : null}

        {isEditor ? (
          <>
            <div className="mx-0.5 h-4 w-px bg-border/70" />
            <ToolbarIconButton
              testId="xlsx-undo-button"
              label="Undo"
              disabled={!canUndo}
              onClick={() => undo()}
            >
              <Undo2 className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-redo-button"
              label="Redo"
              disabled={!canRedo}
              onClick={() => redo()}
            >
              <Redo2 className="size-3.5" />
            </ToolbarIconButton>

            <div className="mx-0.5 h-4 w-px bg-border/70" />

            <select
              aria-label="Font family"
              data-testid="xlsx-font-family-select"
              disabled={!canStyle}
              value={currentFontFamily}
              onChange={(event) =>
                applyStyle({ font: { name: event.target.value } })
              }
              className="h-7 max-w-[116px] truncate rounded-md border border-border/80 bg-muted/40 px-1.5 text-[11px] font-medium text-foreground outline-none hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-40"
            >
              {!FONT_FAMILIES.includes(
                currentFontFamily as (typeof FONT_FAMILIES)[number],
              ) ? (
                <option value={currentFontFamily}>{currentFontFamily}</option>
              ) : null}
              {FONT_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>

            <select
              aria-label="Font size"
              data-testid="xlsx-font-size-select"
              disabled={!canStyle}
              value={String(currentFontSize)}
              onChange={(event) =>
                applyStyle({ font: { size: Number(event.target.value) } })
              }
              className="h-7 rounded-md border border-border/80 bg-muted/40 px-1.5 font-mono text-[11px] font-medium text-foreground outline-none hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-40"
            >
              {!FONT_SIZE_PRESETS.includes(
                currentFontSize as (typeof FONT_SIZE_PRESETS)[number],
              ) ? (
                <option value={currentFontSize}>{currentFontSize}</option>
              ) : null}
              {FONT_SIZE_PRESETS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            <select
              aria-label="Number format"
              data-testid="xlsx-number-format-select"
              disabled={!canStyle}
              value={currentNumberFormatId}
              onChange={(event) => {
                const preset = NUMBER_FORMAT_PRESETS.find(
                  (item) => item.id === event.target.value,
                );
                if (!preset) return;
                applyStyle({
                  numberFormat:
                    preset.id === "general"
                      ? { formatType: "general" }
                      : {
                          formatType: "custom",
                          formatString: preset.formatString,
                        },
                });
              }}
              className="h-7 max-w-[96px] rounded-md border border-border/80 bg-muted/40 px-1.5 text-[11px] font-medium text-foreground outline-none hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-40"
            >
              {NUMBER_FORMAT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>

            <ToolbarIconButton
              testId="xlsx-bold-button"
              label="Bold"
              active={isBold}
              disabled={!canStyle}
              onClick={() => applyStyle({ font: { bold: !isBold } })}
            >
              <Bold className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-italic-button"
              label="Italic"
              active={isItalic}
              disabled={!canStyle}
              onClick={() => applyStyle({ font: { italic: !isItalic } })}
            >
              <Italic className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-underline-button"
              label="Underline"
              active={isUnderline}
              disabled={!canStyle}
              onClick={() =>
                applyStyle({
                  font: { underline: isUnderline ? "none" : "single" },
                })
              }
            >
              <Underline className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-strike-button"
              label="Strikethrough"
              active={isStrike}
              disabled={!canStyle}
              onClick={() => applyStyle({ font: { strikethrough: !isStrike } })}
            >
              <Strikethrough className="size-3.5" />
            </ToolbarIconButton>

            <XlsxColorAndBorderMenus
              applyStyle={applyStyle}
              canStyle={canStyle}
            />

            <div className="mx-0.5 h-4 w-px bg-border/70" />

            <ToolbarIconButton
              testId="xlsx-align-left-button"
              label="Align left"
              active={currentAlign === "left"}
              disabled={!canStyle}
              onClick={() => applyStyle({ alignment: { horizontal: "left" } })}
            >
              <AlignLeft className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-align-center-button"
              label="Align center"
              active={currentAlign === "center"}
              disabled={!canStyle}
              onClick={() =>
                applyStyle({ alignment: { horizontal: "center" } })
              }
            >
              <AlignCenter className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-align-right-button"
              label="Align right"
              active={currentAlign === "right"}
              disabled={!canStyle}
              onClick={() => applyStyle({ alignment: { horizontal: "right" } })}
            >
              <AlignRight className="size-3.5" />
            </ToolbarIconButton>
            <select
              aria-label="Vertical alignment"
              data-testid="xlsx-vertical-align-select"
              disabled={!canStyle}
              value={currentVerticalAlign}
              onChange={(event) =>
                applyStyle({
                  alignment: {
                    vertical: event.target.value as "top" | "center" | "bottom",
                  },
                })
              }
              className="h-7 rounded-md border border-border/80 bg-muted/40 px-1.5 text-[11px] font-medium text-foreground outline-none hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-40"
            >
              <option value="top">Top</option>
              <option value="center">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
            <ToolbarIconButton
              testId="xlsx-wrap-text-button"
              label="Wrap text"
              active={isWrapText}
              disabled={!canStyle}
              onClick={() => applyStyle({ alignment: { wrapText: !isWrapText } })}
            >
              <WrapText className="size-3.5" />
            </ToolbarIconButton>

            <XlsxBorderDropdownMenu
              applyStyle={applyStyle}
              canStyle={canStyle}
            />

            <div className="mx-0.5 h-4 w-px bg-border/70" />

            <ToolbarIconButton
              testId="xlsx-merge-button"
              label="Merge & center selected cells"
              disabled={!selection}
              onClick={() => {
                mergeSelection();
                applyStyle({ alignment: { horizontal: "center" } });
              }}
            >
              <Merge className="size-3.5" />
            </ToolbarIconButton>
            <ToolbarIconButton
              testId="xlsx-unmerge-button"
              label="Unmerge selected cells"
              disabled={!selection}
              onClick={() => unmergeSelection()}
            >
              <Split className="size-3.5" />
            </ToolbarIconButton>
          </>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isEditor && editSession ? (
          <EditorSaveControls editSession={editSession} />
        ) : null}

        <WorkbookSearchPopover
          viewportRef={viewportRef}
          openRequest={searchOpenRequest}
        />

        <div className="inline-flex items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
          <button
            type="button"
            data-testid="xlsx-zoom-out-button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!canZoomOut}
            onClick={() => zoomOut()}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <select
            aria-label="Workbook zoom"
            data-testid="xlsx-zoom-select"
            value={String(currentZoom)}
            onChange={(event) => setZoomScale(Number(event.target.value))}
            className="h-6 cursor-pointer bg-transparent px-1.5 font-mono text-[11px] font-medium text-foreground outline-none"
          >
            {!ZOOM_PRESETS.includes(
              currentZoom as (typeof ZOOM_PRESETS)[number],
            ) ? (
              <option value={currentZoom}>{currentZoom}%</option>
            ) : null}
            {ZOOM_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}%
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="xlsx-zoom-in-button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={!canZoomIn}
            onClick={() => zoomIn()}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>

        {onRoleChange ? (
          <SurfaceModeSwitcher
            role={role}
            canEdit={canSwitchRole}
            onRoleChange={onRoleChange}
            onPreloadRole={onPreloadRole}
          />
        ) : null}

        {toolbarActions}

        {hasMoreMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More options"
                data-testid="xlsx-more-options-trigger"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {extraMenuItems}
              {extraMenuItems && showDownloadButton ? (
                <DropdownMenuSeparator />
              ) : null}
              {showDownloadButton ? (
                <>
                  <DropdownMenuItem
                    disabled={!canExport}
                    onClick={() => exportXlsx()}
                  >
                    <Download className="size-4" />
                    <span>Download Excel (.xlsx)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canExport}
                    onClick={() => exportCsv()}
                  >
                    <Download className="size-4" />
                    <span>Export active sheet (.csv)</span>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
