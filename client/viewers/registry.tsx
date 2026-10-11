import * as React from "react";
import { Spinner } from "../vendor/components/ui/spinner.js";
import type {
  FileSystemPdfSettings,
  FileSystemTextSettings,
  FileSystemViewerKind,
} from "../vendor/file-system/types.js";
import { cn } from "../vendor/lib/utils.js";
import {
  DocxViewerPreview,
  PptxViewerPreview,
  XlsxViewerPreview,
} from "../vendor/stub-viewer.js";
import { ImageViewer } from "./image-viewer.js";
import { TextViewer } from "./text-viewer.js";

const LazyPDFViewer = React.lazy(() =>
  import("../vendor/pdf-viewer.js").then((mod) => ({
    default: mod.PDFViewer,
  })),
);

export type FileViewerVariant = "stage" | "in-place" | "dialog" | "tab";

export interface FileViewerRenderProps {
  kind: FileSystemViewerKind;
  src: string;
  fileName?: string;
  variant?: FileViewerVariant;
  pdfSettings?: FileSystemPdfSettings;
  textSettings?: FileSystemTextSettings;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  className?: string;
}

export type FileViewerRenderer = (
  props: FileViewerRenderProps,
) => React.ReactNode;

export function FileViewerLoadingFallback() {
  return (
    <div className="grid h-full min-h-48 flex-1 place-items-center bg-background">
      <Spinner className="size-4 text-muted-foreground" />
    </div>
  );
}

const viewerRenderers = new Map<FileSystemViewerKind, FileViewerRenderer>([
  [
    "pdf",
    ({
      src,
      fileName,
      variant = "in-place",
      pdfSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyPDFViewer
            src={src}
            fileName={fileName}
            defaultSidebarOpen={pdfSettings?.showThumbnailsByDefault ?? false}
            defaultZoom={pdfSettings?.defaultZoom ?? "fit-width"}
            showDownload={pdfSettings?.showDownloadButton ?? true}
            showRotateControls={pdfSettings?.showRotateControls ?? true}
            showToolbar={hasFullChrome}
            showUpload={false}
            extraMenuItems={hasFullChrome ? extraMenuItems : undefined}
            toolbarActions={hasFullChrome ? toolbarActions : undefined}
            className={cn(
              "h-full min-h-0 overflow-hidden",
              isDialog && "rounded-2xl",
              className,
            )}
          />
        </React.Suspense>
      );
    },
  ],
  [
    "text",
    ({
      src,
      fileName,
      variant = "in-place",
      textSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <TextViewer
          src={src}
          fileName={fileName}
          showLineNumbers={textSettings?.showLineNumbers ?? true}
          wordWrap={textSettings?.wordWrap ?? true}
          showToolbar={hasFullChrome}
          extraMenuItems={hasFullChrome ? extraMenuItems : undefined}
          toolbarActions={hasFullChrome ? toolbarActions : undefined}
          className={cn(
            "h-full min-h-0",
            isDialog && "overflow-hidden rounded-2xl",
            className,
          )}
        />
      );
    },
  ],
  [
    "image",
    ({
      src,
      fileName,
      variant = "in-place",
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <ImageViewer
          src={src}
          fileName={fileName}
          showToolbar={hasFullChrome}
          extraMenuItems={hasFullChrome ? extraMenuItems : undefined}
          toolbarActions={hasFullChrome ? toolbarActions : undefined}
          className={cn(
            hasFullChrome && "h-full min-h-0",
            isDialog && "overflow-hidden rounded-2xl",
            className,
          )}
        />
      );
    },
  ],
  [
    "docx",
    ({ fileName, variant = "in-place", className }) => (
      <DocxViewerPreview
        fileName={fileName}
        className={cn(
          "h-full min-h-0",
          variant === "dialog" && "overflow-hidden rounded-2xl",
          className,
        )}
      />
    ),
  ],
  [
    "pptx",
    ({ fileName, variant = "in-place", className }) => (
      <PptxViewerPreview
        fileName={fileName}
        className={cn(
          "h-full min-h-0",
          variant === "dialog" && "overflow-hidden rounded-2xl",
          className,
        )}
      />
    ),
  ],
  [
    "xlsx",
    ({ fileName, variant = "in-place", className }) => (
      <XlsxViewerPreview
        fileName={fileName}
        className={cn(
          "h-full min-h-0",
          variant === "dialog" && "overflow-hidden rounded-2xl",
          className,
        )}
      />
    ),
  ],
]);

export function registerFileViewer(
  kind: FileSystemViewerKind,
  renderer: FileViewerRenderer,
): void {
  viewerRenderers.set(kind, renderer);
}

export function getRegisteredFileViewer(
  kind: FileSystemViewerKind,
): FileViewerRenderer | undefined {
  return viewerRenderers.get(kind);
}

export function RegisteredFileViewer(props: FileViewerRenderProps) {
  const renderer = viewerRenderers.get(props.kind);
  if (!renderer) return null;
  return <>{renderer(props)}</>;
}
