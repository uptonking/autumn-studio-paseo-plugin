import * as React from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { sanitizeAssetRelativePath } from "../../shared/asset-paths.js";
import { cn } from "../vendor/lib/utils.js";

export function isAiTextViewerAssetPath(assetPath: string): boolean {
  return sanitizeAssetRelativePath(assetPath) !== null;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

type AssetImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string }
  | { status: "unavailable" };

export interface AiTextAssetImageProps {
  /** Version-relative path such as `images/<sha>.jpg`. */
  assetPath: string;
  alt: string;
  loadAsset: (assetPath: string) => Promise<{
    mimeType: string;
    base64: string;
  }>;
  className?: string;
  placeholderClassName?: string;
}

/**
 * Loads one MinerU image lazily when it scrolls near the viewport. The daemon
 * returns base64, which becomes a blob URL revoked with the component.
 */
export function AiTextAssetImage({
  assetPath,
  alt,
  loadAsset,
  className,
  placeholderClassName,
}: AiTextAssetImageProps) {
  const containerRef = React.useRef<HTMLSpanElement | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const [state, setState] = React.useState<AssetImageState>({
    status: "idle",
  });

  React.useEffect(() => {
    if (isVisible) return;
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  React.useEffect(() => {
    if (!isVisible) return;
    if (!isAiTextViewerAssetPath(assetPath)) {
      setState({ status: "unavailable" });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: "loading" });
    loadAsset(assetPath).then(
      ({ mimeType, base64 }) => {
        if (cancelled) return;
        try {
          objectUrl = base64ToBlobUrl(base64, mimeType);
          setState({ status: "ready", url: objectUrl });
        } catch {
          setState({ status: "error", message: "Image could not be decoded" });
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Image is unavailable",
        });
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetPath, isVisible, loadAsset]);

  return (
    <span
      ref={containerRef}
      data-testid="ai-text-asset-image"
      data-asset-path={assetPath}
      className={cn("block min-h-12 min-w-12", placeholderClassName)}
    >
      {state.status === "ready" ? (
        <img
          src={state.url}
          alt={alt}
          loading="lazy"
          data-testid="ai-text-asset-image-loaded"
          className={cn("block max-w-full rounded-sm", className)}
        />
      ) : state.status === "error" || state.status === "unavailable" ? (
        <span
          title={state.status === "error" ? state.message : assetPath}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-sm border border-dashed border-border/70 bg-muted/30 px-2 py-3 text-[10px] text-muted-foreground"
        >
          <ImageOff className="size-3.5 shrink-0" />
          <span className="truncate">{alt || assetPath}</span>
        </span>
      ) : (
        <span className="flex min-h-12 items-center justify-center rounded-sm bg-muted/30 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      )}
    </span>
  );
}
