"use client";

import * as React from "react";
import {
  useXlsxViewer,
  useXlsxViewerEditing,
  useXlsxViewerSelection,
} from "@extend-ai/react-xlsx";
import { cn } from "../lib/utils";

export interface XlsxFormulaBarProps {
  readOnly: boolean;
}

export function XlsxFormulaBar({ readOnly }: XlsxFormulaBarProps) {
  const { sheets } = useXlsxViewer();
  const { activeCell, activeCellAddress, selectedRangeAddress } =
    useXlsxViewerSelection();
  const {
    selectedFormula,
    selectedValue,
    setCellFormula,
    setCellValue,
  } = useXlsxViewerEditing();

  const selectedCellInputValue = selectedFormula || selectedValue || "";
  const [formulaDraft, setFormulaDraft] = React.useState("");
  const formulaDraftRef = React.useRef("");
  const [formulaFocused, setFormulaFocused] = React.useState(false);
  const formulaEditCellRef = React.useRef<typeof activeCell>(null);
  const formulaInitialValueRef = React.useRef("");

  const hasWorkbook = sheets.length > 0;
  const hasActiveCell = Boolean(activeCell);
  const addressLabel = selectedRangeAddress || activeCellAddress || "A1";

  const commitFormula = React.useCallback(() => {
    if (readOnly) {
      return;
    }
    const targetCell = formulaEditCellRef.current ?? activeCell;
    if (!targetCell) {
      return;
    }
    const draft = formulaDraftRef.current;
    if (draft === formulaInitialValueRef.current) {
      return;
    }
    if (draft.trim().startsWith("=")) {
      setCellFormula(targetCell, draft);
    } else {
      setCellValue(targetCell, draft);
    }
    formulaInitialValueRef.current = draft;
  }, [activeCell, readOnly, setCellFormula, setCellValue]);

  React.useEffect(() => {
    if (!formulaFocused || readOnly) {
      return;
    }
    const prevCell = formulaEditCellRef.current;
    if (
      prevCell &&
      activeCell &&
      (prevCell.row !== activeCell.row || prevCell.col !== activeCell.col)
    ) {
      commitFormula();
      formulaEditCellRef.current = activeCell;
      formulaInitialValueRef.current = selectedCellInputValue;
      formulaDraftRef.current = selectedCellInputValue;
      setFormulaDraft(selectedCellInputValue);
    }
  }, [activeCell, commitFormula, formulaFocused, readOnly, selectedCellInputValue]);

  return (
    <div
      data-testid="xlsx-formula-bar"
      className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/70 bg-background px-2.5 text-xs"
    >
      <div
        data-testid="xlsx-active-cell-address"
        className="flex h-6 min-w-[72px] shrink-0 items-center justify-center rounded border border-border/70 bg-muted/40 px-2 font-mono text-[11px] font-medium text-foreground select-none"
      >
        {hasWorkbook ? addressLabel : "—"}
      </div>
      <div className="flex h-6 w-7 shrink-0 items-center justify-center font-serif text-[11px] font-semibold italic text-muted-foreground select-none">
        fx
      </div>
      <div className="h-4 w-px shrink-0 bg-border/70" />
      <input
        type="text"
        data-testid="xlsx-formula-input"
        aria-label="Cell value or formula"
        readOnly={readOnly || !hasActiveCell}
        disabled={!hasWorkbook}
        value={formulaFocused ? formulaDraft : selectedCellInputValue}
        placeholder={
          !hasWorkbook
            ? ""
            : readOnly
              ? "Select a cell to inspect its value or formula"
              : "Select a cell, then enter a value or =FORMULA"
        }
        onFocus={() => {
          if (readOnly) {
            return;
          }
          formulaEditCellRef.current = activeCell;
          formulaInitialValueRef.current = selectedCellInputValue;
          formulaDraftRef.current = selectedCellInputValue;
          setFormulaDraft(selectedCellInputValue);
          setFormulaFocused(true);
        }}
        onChange={(event) => {
          if (readOnly) {
            return;
          }
          formulaDraftRef.current = event.target.value;
          setFormulaDraft(event.target.value);
        }}
        onBlur={() => {
          if (!readOnly) {
            commitFormula();
          }
          setFormulaFocused(false);
        }}
        onKeyDown={(event) => {
          if (readOnly) {
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            commitFormula();
            setFormulaFocused(false);
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            formulaDraftRef.current = formulaInitialValueRef.current;
            setFormulaDraft(formulaInitialValueRef.current);
            setFormulaFocused(false);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "h-6 min-w-0 flex-1 rounded px-2 font-mono text-xs text-foreground outline-none transition-colors",
          readOnly
            ? "bg-transparent text-muted-foreground cursor-default"
            : "bg-muted/25 focus:bg-muted/50 focus:ring-1 focus:ring-ring/50",
        )}
      />
    </div>
  );
}
