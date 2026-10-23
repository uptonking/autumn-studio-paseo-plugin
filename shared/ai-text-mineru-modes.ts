import type { MineruExecutionMode } from "./ai-text-settings.ts";

/**
 * Which settings actually reach the selected MinerU route.
 *
 * The local Kit CLI has no per-feature OCR/formula/table flags: `--ocr-mode`
 * covers OCR, and table/formula recognition runs as part of layout analysis.
 * The cloud APIs do expose those as request options, so the settings UI must
 * not present them for local modes or imply they are required there.
 */
export interface MineruModeCapabilities {
  /** The selected route starts the local Kit executable. */
  usesKit: boolean;
  /** The route talks to a local API daemon. */
  usesLocalApi: boolean;
  /** The local Kit route can target a remote parse server. */
  usesRemoteServer: boolean;
  /** Local-only extraction controls apply. */
  showsLocalExtraction: boolean;
  /** Cloud-only OCR and recognition controls apply. */
  showsCloudExtraction: boolean;
  /** The mode can persist layout geometry. */
  showsLayoutSwitch: boolean;
  /** A cloud endpoint is configurable. */
  showsCloudEndpoint: boolean;
  /** A cloud API token is configurable. */
  showsToken: boolean;
}

export function getMineruModeCapabilities(
  mode: MineruExecutionMode,
): MineruModeCapabilities {
  const local = mode === "local-cli" || mode === "local-api" || mode === "auto";
  const cloud = mode === "cloud-token" || mode === "cloud-free";
  return {
    usesKit: local,
    usesLocalApi: mode === "local-api" || mode === "auto",
    usesRemoteServer: mode === "local-cli" || mode === "auto",
    showsLocalExtraction: local,
    showsCloudExtraction: cloud,
    showsLayoutSwitch: mode !== "cloud-free",
    showsCloudEndpoint: cloud,
    showsToken: mode === "cloud-token" || mode === "auto",
  };
}
