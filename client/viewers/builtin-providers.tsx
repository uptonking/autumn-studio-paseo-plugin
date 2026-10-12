import * as React from "react";
import { SurfaceModeSwitcher } from "../editing/surface-mode-controls.js";
import { lazyWithPreload } from "../lazy-with-preload.js";
import { Spinner } from "../vendor/components/ui/spinner.js";
import { loadSharedPdfEngine } from "../vendor/lib/pdf-thumbnail-utils.js";
import { cn } from "../vendor/lib/utils.js";
import { preloadPdfLib } from "../vendor/pdf-viewer/pdf-save.js";
import { ensureXlsxWasmReady } from "../vendor/xlsx-viewer/wasm-loader.js";
import type { FileSurfaceProviderDescriptor } from "./registry.js";

const LazyPDFViewer = lazyWithPreload(() =>
  import("../vendor/pdf-viewer.js").then((mod) => ({
    default: mod.PDFViewer,
  })),
);

const LazyPDFEditor = lazyWithPreload(() =>
  import("../vendor/pdf-viewer/pdf-editor.js").then((mod) => ({
    default: mod.PDFEditor,
  })),
);

const LazyExtendXlsxViewer = lazyWithPreload(() =>
  import("../vendor/xlsx-viewer/index.js").then((mod) => ({
    default: mod.ExtendXlsxViewer,
  })),
);

const LazyExtendXlsxEditor = lazyWithPreload(() =>
  import("../vendor/xlsx-viewer/index.js").then((mod) => ({
    default: mod.ExtendXlsxEditor,
  })),
);

const LazyTextViewer = lazyWithPreload(() =>
  import("./text-viewer.js").then((mod) => ({
    default: mod.TextViewer,
  })),
);

const LazyTextEditor = lazyWithPreload(() =>
  import("./text-viewer.js").then((mod) => ({
    default: mod.TextEditor,
  })),
);

const LazyImageViewer = lazyWithPreload(() =>
  import("./image-viewer.js").then((mod) => ({
    default: mod.ImageViewer,
  })),
);

const LazyDocxViewerPreview = lazyWithPreload(() =>
  import("../vendor/stub-viewer.js").then((mod) => ({
    default: mod.DocxViewerPreview,
  })),
);

const LazyPptxViewerPreview = lazyWithPreload(() =>
  import("../vendor/stub-viewer.js").then((mod) => ({
    default: mod.PptxViewerPreview,
  })),
);

export function FileViewerLoadingFallback() {
  return (
    <div className="grid h-full min-h-48 flex-1 place-items-center bg-background">
      <Spinner className="size-4 text-muted-foreground" />
    </div>
  );
}

export function registerBuiltinSurfaceProviders(
  register: (descriptor: FileSurfaceProviderDescriptor) => void,
): void {
  register({
    id: "embedpdf-viewer",
    kind: "pdf",
    role: "viewer",
    label: "EmbedPDF Viewer (Default)",
    isDefault: true,
    preload: async () => {
      await Promise.all([
        LazyPDFViewer.preload(),
        loadSharedPdfEngine().catch(() => undefined),
      ]);
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      role,
      canSwitchRole,
      onRoleChange,
      pdfSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      const combinedActions = hasFullChrome ? (
        <div className="flex items-center gap-1.5">
          {canSwitchRole && onRoleChange ? (
            <SurfaceModeSwitcher
              role={role}
              canEdit={canSwitchRole}
              onRoleChange={onRoleChange}
            />
          ) : null}
          {toolbarActions}
        </div>
      ) : undefined;
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
            toolbarActions={combinedActions}
            className={cn(
              "h-full min-h-0 overflow-hidden",
              isDialog && "rounded-2xl",
              className,
            )}
          />
        </React.Suspense>
      );
    },
  });

  register({
    id: "embedpdf-editor",
    kind: "pdf",
    role: "editor",
    label: "EmbedPDF Editor (Default)",
    isDefault: true,
    preload: async () => {
      await Promise.all([
        LazyPDFEditor.preload(),
        preloadPdfLib().catch(() => undefined),
        loadSharedPdfEngine().catch(() => undefined),
      ]);
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      role,
      canSwitchRole,
      onRoleChange,
      editSession,
      pdfSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyPDFEditor
            src={src}
            fileName={fileName}
            role={role}
            canSwitchRole={canSwitchRole}
            onRoleChange={onRoleChange}
            editSession={editSession}
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
  });

  register({
    id: "extend-xlsx-viewer",
    kind: "xlsx",
    role: "viewer",
    label: "Extend Excel Viewer (Default)",
    isDefault: true,
    preload: async () => {
      await Promise.all([
        LazyExtendXlsxViewer.preload(),
        ensureXlsxWasmReady().catch(() => undefined),
      ]);
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      canSwitchRole,
      onRoleChange,
      xlsxSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyExtendXlsxViewer
            src={src}
            fileName={fileName}
            canSwitchRole={hasFullChrome && canSwitchRole}
            onRoleChange={hasFullChrome ? onRoleChange : undefined}
            xlsxSettings={xlsxSettings}
            showToolbar={hasFullChrome}
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
  });

  register({
    id: "extend-xlsx-editor",
    kind: "xlsx",
    role: "editor",
    label: "Extend Excel Editor (Default)",
    isDefault: true,
    preload: async () => {
      await Promise.all([
        LazyExtendXlsxEditor.preload(),
        ensureXlsxWasmReady().catch(() => undefined),
      ]);
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      canSwitchRole,
      onRoleChange,
      editSession,
      xlsxSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyExtendXlsxEditor
            src={src}
            fileName={fileName}
            canSwitchRole={hasFullChrome && canSwitchRole}
            onRoleChange={hasFullChrome ? onRoleChange : undefined}
            editSession={editSession}
            xlsxSettings={xlsxSettings}
            showToolbar={hasFullChrome}
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
  });

  register({
    id: "code-text-viewer",
    kind: "text",
    role: "viewer",
    label: "Code & Text Viewer (Default)",
    isDefault: true,
    preload: async () => {
      await LazyTextViewer.preload();
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      canSwitchRole,
      onRoleChange,
      textSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyTextViewer
            src={src}
            fileName={fileName}
            role="viewer"
            canSwitchRole={hasFullChrome && canSwitchRole}
            onRoleChange={hasFullChrome ? onRoleChange : undefined}
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
        </React.Suspense>
      );
    },
  });

  register({
    id: "code-text-editor",
    kind: "text",
    role: "editor",
    label: "Code & Text Editor (Default)",
    isDefault: true,
    preload: async () => {
      await LazyTextEditor.preload();
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      canSwitchRole,
      onRoleChange,
      editSession,
      textSettings,
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      const isDialog = variant === "dialog";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyTextEditor
            src={src}
            fileName={fileName}
            canSwitchRole={hasFullChrome && canSwitchRole}
            onRoleChange={hasFullChrome ? onRoleChange : undefined}
            editSession={editSession}
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
        </React.Suspense>
      );
    },
  });

  register({
    id: "image-viewer",
    kind: "image",
    role: "viewer",
    label: "Image Viewer (Default)",
    isDefault: true,
    preload: async () => {
      await LazyImageViewer.preload();
    },
    renderer: ({
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
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyImageViewer
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
        </React.Suspense>
      );
    },
  });

  register({
    id: "docx-stub-viewer",
    kind: "docx",
    role: "viewer",
    label: "Word Document Preview",
    isDefault: true,
    preload: async () => {
      await LazyDocxViewerPreview.preload();
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyDocxViewerPreview
            src={src}
            fileName={fileName}
            showToolbar={hasFullChrome}
            extraMenuItems={hasFullChrome ? extraMenuItems : undefined}
            toolbarActions={hasFullChrome ? toolbarActions : undefined}
            className={cn(
              "h-full min-h-0",
              variant === "dialog" && "overflow-hidden rounded-2xl",
              className,
            )}
          />
        </React.Suspense>
      );
    },
  });

  register({
    id: "pptx-stub-viewer",
    kind: "pptx",
    role: "viewer",
    label: "PowerPoint Preview",
    isDefault: true,
    preload: async () => {
      await LazyPptxViewerPreview.preload();
    },
    renderer: ({
      src,
      fileName,
      variant = "in-place",
      extraMenuItems,
      toolbarActions,
      className,
    }) => {
      const hasFullChrome = variant !== "stage";
      return (
        <React.Suspense fallback={<FileViewerLoadingFallback />}>
          <LazyPptxViewerPreview
            src={src}
            fileName={fileName}
            showToolbar={hasFullChrome}
            extraMenuItems={hasFullChrome ? extraMenuItems : undefined}
            toolbarActions={hasFullChrome ? toolbarActions : undefined}
            className={cn(
              "h-full min-h-0",
              variant === "dialog" && "overflow-hidden rounded-2xl",
              className,
            )}
          />
        </React.Suspense>
      );
    },
  });
}
