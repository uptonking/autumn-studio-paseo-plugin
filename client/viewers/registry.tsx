import * as React from "react";
import {
  AiTextSurfaceSplitWrapper,
  type AiTextBridge,
} from "../ai-text/ai-text-context.js";
import { AiTextMenuInjector } from "../ai-text/ai-text-menu-items.js";
import { isInAppSavedBlobUrl } from "../blob-url-cache.js";
import { FileSurfacePreloadContext } from "../editing/surface-mode-controls.js";
import {
  useFileEditSession,
  type FileEditSession,
  type SerializedFilePayload,
} from "../editing/use-file-edit-session.js";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../vendor/components/ui/dropdown-menu.js";
import type {
  FileSystemFormatSettingsMap,
  FileSystemPdfSettings,
  FileSystemTextSettings,
  FileSystemViewerKind,
  FileSystemXlsxSettings,
} from "../vendor/file-system/types.js";
import {
  FileViewerLoadingFallback,
  registerBuiltinSurfaceProviders,
} from "./builtin-providers.js";
import {
  registerSurfaceProviderMeta,
  type FileSurfaceProviderMeta,
  type FileSurfaceRole,
} from "./provider-catalog.js";

export { FileViewerLoadingFallback };

export type FileViewerVariant = "stage" | "in-place" | "dialog" | "tab";

export interface FileSaveCallbackInput {
  relPath: string;
  payload: SerializedFilePayload;
  contentType?: string;
}

export interface FileSaveCallbackResult {
  path: string;
  size: number;
  mtime: number;
  blobUrl: string;
}

export interface FileViewerRenderProps {
  kind: FileSystemViewerKind;
  src: string;
  filePath?: string;
  fileName?: string;
  contentType?: string;
  variant?: FileViewerVariant;
  role?: FileSurfaceRole;
  providerId?: string;
  pdfSettings?: FileSystemPdfSettings;
  xlsxSettings?: FileSystemXlsxSettings;
  textSettings?: FileSystemTextSettings;
  formatSettings?: FileSystemFormatSettingsMap;
  aiText?: AiTextBridge;
  sourceUpdatedAt?: number;
  sourceFileSize?: number;
  autoSaveEdits?: boolean;
  onSaveFile?: (input: FileSaveCallbackInput) => Promise<FileSaveCallbackResult>;
  onOpenSettings?(): void;
  onDirtyChange?: (isDirty: boolean) => void;
  extraMenuItems?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  className?: string;
}

export interface ResolvedFileSurfaceRenderProps extends FileViewerRenderProps {
  role: FileSurfaceRole;
  providerId: string;
  canSwitchRole: boolean;
  onRoleChange?: (nextRole: FileSurfaceRole) => void;
  editSession?: FileEditSession;
}

export type FileViewerRenderer = (
  props: ResolvedFileSurfaceRenderProps,
) => React.ReactNode;

export interface FileSurfaceProviderDescriptor extends FileSurfaceProviderMeta {
  renderer: FileViewerRenderer;
  preload?: () => Promise<void>;
}

const surfaceProvidersById = new Map<string, FileSurfaceProviderDescriptor>();

export function registerFileSurfaceProvider(
  descriptor: FileSurfaceProviderDescriptor,
): () => void {
  surfaceProvidersById.set(descriptor.id, descriptor);
  const unregisterMeta = registerSurfaceProviderMeta({
    id: descriptor.id,
    kind: descriptor.kind,
    role: descriptor.role,
    label: descriptor.label,
    isDefault: descriptor.isDefault,
  });
  return () => {
    surfaceProvidersById.delete(descriptor.id);
    unregisterMeta();
  };
}

export function getRegisteredSurfaceProviders(
  kind: FileSystemViewerKind,
  role?: FileSurfaceRole,
): FileSurfaceProviderDescriptor[] {
  const results: FileSurfaceProviderDescriptor[] = [];
  for (const descriptor of surfaceProvidersById.values()) {
    if (descriptor.kind !== kind) continue;
    if (role && descriptor.role !== role) continue;
    results.push(descriptor);
  }
  return results;
}

export function resolveFileSurfaceProvider(
  kind: FileSystemViewerKind,
  role: FileSurfaceRole,
  preferredProviderId?: string,
): FileSurfaceProviderDescriptor | undefined {
  const candidates = getRegisteredSurfaceProviders(kind, role);
  if (preferredProviderId) {
    const preferred = candidates.find((p) => p.id === preferredProviderId);
    if (preferred) return preferred;
  }
  return (
    candidates.find((p) => p.isDefault) ??
    candidates[0] ??
    (role === "editor"
      ? resolveFileSurfaceProvider(kind, "viewer")
      : undefined)
  );
}

export function getFormatSettingsPreference(
  kind: FileSystemViewerKind,
  settings?: {
    pdfSettings?: FileSystemPdfSettings;
    xlsxSettings?: FileSystemXlsxSettings;
    textSettings?: FileSystemTextSettings;
    formatSettings?: FileSystemFormatSettingsMap;
  },
): {
  defaultOpenBehavior: FileSurfaceRole;
  defaultViewer?: string;
  defaultEditor?: string;
} {
  if (kind === "pdf") {
    return {
      defaultOpenBehavior:
        settings?.pdfSettings?.defaultOpenBehavior === "editor"
          ? "editor"
          : "viewer",
      defaultViewer: settings?.pdfSettings?.defaultViewer,
      defaultEditor: settings?.pdfSettings?.defaultEditor,
    };
  }
  if (kind === "xlsx") {
    return {
      defaultOpenBehavior:
        settings?.xlsxSettings?.defaultOpenBehavior === "editor"
          ? "editor"
          : "viewer",
      defaultViewer: settings?.xlsxSettings?.defaultViewer,
      defaultEditor: settings?.xlsxSettings?.defaultEditor,
    };
  }
  if (kind === "text") {
    return {
      defaultOpenBehavior:
        settings?.textSettings?.defaultOpenBehavior === "editor"
          ? "editor"
          : "viewer",
      defaultViewer: settings?.textSettings?.defaultViewer,
      defaultEditor: settings?.textSettings?.defaultEditor,
    };
  }
  const extra = settings?.formatSettings?.[kind];
  return {
    defaultOpenBehavior:
      extra?.defaultOpenBehavior === "editor" ? "editor" : "viewer",
    defaultViewer:
      typeof extra?.defaultViewer === "string"
        ? extra.defaultViewer
        : undefined,
    defaultEditor:
      typeof extra?.defaultEditor === "string"
        ? extra.defaultEditor
        : undefined,
  };
}

export function resolveDefaultSurfaceForFile(
  kind: FileSystemViewerKind,
  settings?: {
    pdfSettings?: FileSystemPdfSettings;
    xlsxSettings?: FileSystemXlsxSettings;
    textSettings?: FileSystemTextSettings;
    formatSettings?: FileSystemFormatSettingsMap;
  },
  variant: FileViewerVariant = "in-place",
): {
  role: FileSurfaceRole;
  provider?: FileSurfaceProviderDescriptor;
} {
  if (variant === "stage") {
    const pref = getFormatSettingsPreference(kind, settings);
    return {
      role: "viewer",
      provider: resolveFileSurfaceProvider(kind, "viewer", pref.defaultViewer),
    };
  }

  const pref = getFormatSettingsPreference(kind, settings);
  const targetRole = pref.defaultOpenBehavior;
  const preferredId =
    targetRole === "editor" ? pref.defaultEditor : pref.defaultViewer;
  const provider = resolveFileSurfaceProvider(kind, targetRole, preferredId);
  return {
    role: provider?.role ?? "viewer",
    provider,
  };
}

export function preloadFileSurfaceProvider(providerId: string): Promise<void> {
  const descriptor = surfaceProvidersById.get(providerId);
  if (!descriptor?.preload) {
    return Promise.resolve();
  }
  return descriptor.preload().catch(() => undefined);
}

/**
 * Renders a provider inside its own component so provider hooks (notably the
 * PDF overlay bridge) read `AiTextSurfaceContext` from the split wrapper.
 * Calling `renderer(props)` directly in `RegisteredFileViewer` would run those
 * hooks in the parent render, outside the context provider.
 */
function FileSurfaceRenderer({
  renderer,
  props,
}: {
  renderer: FileViewerRenderer;
  props: ResolvedFileSurfaceRenderProps;
}) {
  return <>{renderer(props)}</>;
}

export function preloadFileSurfaceForKind(
  kind: FileSystemViewerKind,
  settings?: {
    pdfSettings?: FileSystemPdfSettings;
    xlsxSettings?: FileSystemXlsxSettings;
    textSettings?: FileSystemTextSettings;
    formatSettings?: FileSystemFormatSettingsMap;
  },
  roleOverride?: FileSurfaceRole,
): Promise<void> {
  const pref = getFormatSettingsPreference(kind, settings);
  const targetRole = roleOverride ?? pref.defaultOpenBehavior;
  const preferredId =
    targetRole === "editor" ? pref.defaultEditor : pref.defaultViewer;
  const provider = resolveFileSurfaceProvider(kind, targetRole, preferredId);
  if (!provider?.preload) {
    return Promise.resolve();
  }
  return provider.preload().catch(() => undefined);
}

registerBuiltinSurfaceProviders(registerFileSurfaceProvider);

export function RegisteredFileViewer(props: FileViewerRenderProps) {
  const {
    kind,
    src,
    filePath,
    contentType,
    variant = "in-place",
    role: explicitRole,
    providerId: explicitProviderId,
    pdfSettings,
    xlsxSettings,
    textSettings,
    formatSettings,
    autoSaveEdits = true,
    onSaveFile,
    onDirtyChange,
    extraMenuItems,
  } = props;

  const formatPrefs = React.useMemo(
    () =>
      getFormatSettingsPreference(kind, {
        pdfSettings,
        xlsxSettings,
        textSettings,
        formatSettings,
      }),
    [formatSettings, kind, pdfSettings, textSettings, xlsxSettings],
  );

  const [roleOverride, setRoleOverride] =
    React.useState<FileSurfaceRole | null>(null);
  const [providerOverride, setProviderOverride] = React.useState<string | null>(
    null,
  );
  const latestSavedBlobUrlRef = React.useRef<string | null>(null);
  const savedBlobUrlsRef = React.useRef<Set<string>>(new Set());

  const hasEditorSupport = React.useMemo(
    () => getRegisteredSurfaceProviders(kind, "editor").length > 0,
    [kind],
  );

  const effectiveRole: FileSurfaceRole =
    variant === "stage"
      ? "viewer"
      : (explicitRole ??
        roleOverride ??
        (formatPrefs.defaultOpenBehavior === "editor" && hasEditorSupport
          ? "editor"
          : "viewer"));
  const effectiveRoleRef = React.useRef<FileSurfaceRole>(effectiveRole);
  effectiveRoleRef.current = effectiveRole;

  React.useEffect(() => {
    setRoleOverride(null);
    setProviderOverride(null);
  }, [filePath, formatPrefs.defaultOpenBehavior]);

  const preferredProviderId =
    explicitProviderId ??
    providerOverride ??
    (effectiveRole === "editor"
      ? formatPrefs.defaultEditor
      : formatPrefs.defaultViewer);

  const resolvedProvider = resolveFileSurfaceProvider(
    kind,
    effectiveRole,
    preferredProviderId,
  );

  const surfaceSessionKey = `${filePath ?? ""}::${variant}::${effectiveRole}::${resolvedProvider?.id ?? ""}`;
  const surfaceSessionKeyRef = React.useRef(surfaceSessionKey);
  surfaceSessionKeyRef.current = surfaceSessionKey;

  const [surfaceSourceState, setSurfaceSourceState] = React.useState(() => ({
    filePath,
    sessionKey: surfaceSessionKey,
    propSrc: src,
    activeSrc: src,
  }));

  let activeSrc = surfaceSourceState.activeSrc;
  if (surfaceSourceState.filePath !== filePath) {
    latestSavedBlobUrlRef.current = null;
    savedBlobUrlsRef.current.clear();
    activeSrc = src;
    setSurfaceSourceState({
      filePath,
      sessionKey: surfaceSessionKey,
      propSrc: src,
      activeSrc: src,
    });
  } else if (
    surfaceSourceState.propSrc !== src ||
    surfaceSourceState.sessionKey !== surfaceSessionKey
  ) {
    const propSrcChanged = surfaceSourceState.propSrc !== src;
    const sessionChanged = surfaceSourceState.sessionKey !== surfaceSessionKey;
    const isInAppSavedSrc =
      savedBlobUrlsRef.current.has(src) || isInAppSavedBlobUrl(src);

    if (propSrcChanged && isInAppSavedSrc) {
      latestSavedBlobUrlRef.current = src;
      savedBlobUrlsRef.current.add(src);
    }

    if (propSrcChanged && !isInAppSavedSrc) {
      latestSavedBlobUrlRef.current = null;
      savedBlobUrlsRef.current.clear();
      activeSrc = src;
    } else if (sessionChanged) {
      activeSrc = latestSavedBlobUrlRef.current ?? src;
    } else if (propSrcChanged && effectiveRole !== "editor") {
      activeSrc = src;
    }

    setSurfaceSourceState({
      filePath,
      sessionKey: surfaceSessionKey,
      propSrc: src,
      activeSrc,
    });
  }

  const availableRoleProviders = React.useMemo(
    () => getRegisteredSurfaceProviders(kind, effectiveRole),
    [effectiveRole, kind],
  );

  const editSession = useFileEditSession({
    path: filePath ?? props.fileName ?? src,
    autoSave: autoSaveEdits,
    onSavePayload:
      filePath && onSaveFile
        ? async (payload) => {
            const sessionAtSaveStart = surfaceSessionKeyRef.current;
            const saved = await onSaveFile({
              relPath: filePath,
              payload,
              contentType,
            });
            latestSavedBlobUrlRef.current = saved.blobUrl;
            savedBlobUrlsRef.current.add(saved.blobUrl);
            if (
              effectiveRoleRef.current === "viewer" ||
              surfaceSessionKeyRef.current !== sessionAtSaveStart
            ) {
              setSurfaceSourceState((prev) => ({
                ...prev,
                propSrc: saved.blobUrl,
                activeSrc: saved.blobUrl,
              }));
            }
          }
        : undefined,
  });

  const previousEffectiveRoleRef = React.useRef<FileSurfaceRole>(effectiveRole);
  React.useEffect(() => {
    const prevRole = previousEffectiveRoleRef.current;
    previousEffectiveRoleRef.current = effectiveRole;
    if (prevRole === "editor" && effectiveRole !== "editor") {
      editSession.flushBeforeSave();
      void editSession.saveNow();
    }
  }, [editSession, effectiveRole]);

  React.useEffect(() => {
    onDirtyChange?.(effectiveRole === "editor" && editSession.isDirty);
  }, [editSession.isDirty, effectiveRole, onDirtyChange]);

  const handlePreloadRole = React.useCallback(
    (targetRole: FileSurfaceRole) => {
      void preloadFileSurfaceForKind(
        kind,
        { pdfSettings, xlsxSettings, textSettings, formatSettings },
        targetRole,
      );
    },
    [formatSettings, kind, pdfSettings, textSettings, xlsxSettings],
  );

  const handleRoleChange = React.useCallback(
    (nextRole: FileSurfaceRole) => {
      void preloadFileSurfaceForKind(
        kind,
        { pdfSettings, xlsxSettings, textSettings, formatSettings },
        nextRole,
      );
      if (effectiveRoleRef.current === "editor" && nextRole === "viewer") {
        editSession.flushBeforeSave();
        void editSession.saveNow().then((didSave) => {
          const latestUrl = latestSavedBlobUrlRef.current;
          if (didSave && latestUrl) {
            setSurfaceSourceState((prev) => ({
              ...prev,
              propSrc: latestUrl,
              activeSrc: latestUrl,
            }));
          }
        });
        if (latestSavedBlobUrlRef.current) {
          const latestUrl = latestSavedBlobUrlRef.current;
          setSurfaceSourceState((prev) => ({
            ...prev,
            propSrc: latestUrl,
            activeSrc: latestUrl,
          }));
        }
      } else if (latestSavedBlobUrlRef.current) {
        const latestUrl = latestSavedBlobUrlRef.current;
        setSurfaceSourceState((prev) => ({
          ...prev,
          propSrc: latestUrl,
          activeSrc: latestUrl,
        }));
      }
      effectiveRoleRef.current = nextRole;
      React.startTransition(() => {
        setProviderOverride(null);
        setRoleOverride(nextRole);
      });
    },
    [editSession, formatSettings, kind, pdfSettings, textSettings, xlsxSettings],
  );

  if (!resolvedProvider) return null;

  const combinedExtraMenuItems =
    availableRoleProviders.length > 1 ? (
      <>
        {extraMenuItems}
        {extraMenuItems ? <DropdownMenuSeparator /> : null}
        {availableRoleProviders.map((candidate) => (
          <DropdownMenuItem
            key={candidate.id}
            disabled={candidate.id === resolvedProvider.id}
            onPointerEnter={() => {
              void preloadFileSurfaceProvider(candidate.id);
            }}
            onClick={() => {
              React.startTransition(() => {
                setProviderOverride(candidate.id);
              });
            }}
          >
            Open with {candidate.label}
          </DropdownMenuItem>
        ))}
      </>
    ) : (
      extraMenuItems
    );

  return (
    <FileSurfacePreloadContext.Provider value={handlePreloadRole}>
      <AiTextSurfaceSplitWrapper
        kind={kind}
        filePath={filePath}
        fileName={props.fileName}
        variant={variant}
        aiText={props.aiText}
        sourceUpdatedAt={props.sourceUpdatedAt}
        sourceFileSize={props.sourceFileSize}
        onSaveFile={onSaveFile}
        onOpenSettings={props.onOpenSettings}
      >
        <AiTextMenuInjector
          extraMenuItems={combinedExtraMenuItems}
          allowHideOriginal={
            resolvedProvider.role !== "editor" ||
            !editSession?.isDirty ||
            autoSaveEdits
          }
        >
          {(menuItems) => (
            <FileSurfaceRenderer
              renderer={resolvedProvider.renderer}
              props={{
                ...props,
                src: activeSrc,
                role: resolvedProvider.role,
                providerId: resolvedProvider.id,
                canSwitchRole: variant !== "stage" && hasEditorSupport,
                onRoleChange:
                  variant !== "stage" && hasEditorSupport
                    ? handleRoleChange
                    : undefined,
                editSession:
                  resolvedProvider.role === "editor" ? editSession : undefined,
                extraMenuItems: menuItems,
              }}
            />
          )}
        </AiTextMenuInjector>
      </AiTextSurfaceSplitWrapper>
    </FileSurfacePreloadContext.Provider>
  );
}
