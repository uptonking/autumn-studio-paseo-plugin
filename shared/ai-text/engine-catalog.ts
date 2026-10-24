import {
  aiTextEngineDescriptorSchema,
  type AiTextEngineDescriptor,
  type AiTextEngineOperationOption,
} from "./engines.ts";
import { engineConfigDefaults } from "./engine-configs.ts";

/** Shared "install a pinned release" input for install/reinstall operations. */
const VERSION_OPTION: AiTextEngineOperationOption = {
  key: "version",
  label: "Version (blank = latest)",
  kind: "text",
  defaultValue: "",
  options: [],
};

const MINERU_DESCRIPTOR: AiTextEngineDescriptor = {
  id: "mineru",
  label: "MinerU",
  description:
    "Layout-aware PDF extraction with OCR, formulas, tables, and page geometry. Runs locally through mineru-kit or remotely through the MinerU API.",
  formats: ["pdf"],
  capabilities: {
    layout: true,
    assets: true,
    ocr: true,
    formula: true,
    tables: true,
    language: true,
    pageRange: true,
    imageAnalysis: true,
    localInstall: true,
  },
  routes: [
    {
      id: "auto",
      label: "Auto",
      description:
        "Uses local models and the local API when available, then the cloud routes.",
      kind: "auto",
    },
    {
      id: "local-cli",
      label: "Local CLI",
      description: "Runs mineru-kit on this machine with local models.",
      kind: "local",
    },
    {
      id: "local-api",
      label: "Local API",
      description: "Sends the document to a mineru-kit api-server.",
      kind: "local",
    },
    {
      id: "cloud-token",
      label: "Cloud API (token)",
      description: "MinerU cloud with an API token. Returns layout and images.",
      kind: "cloud",
    },
    {
      id: "cloud-free",
      label: "Cloud API (free)",
      description: "MinerU's free API. Markdown only, no layout geometry.",
      kind: "cloud",
    },
  ],
  defaultRoute: "auto",
  // Local routes always run OCR, formula, and table recognition; those
  // request flags only exist on the cloud APIs. Auto can land on either, so
  // only the intersection is promised.
  routeCapabilities: {
    auto: {
      formula: false,
      tables: false,
      language: false,
      imageAnalysis: false,
    },
    "local-cli": { formula: false, tables: false, language: false },
    "local-api": { formula: false, tables: false, language: false },
    "cloud-token": { pageRange: false, imageAnalysis: false },
    "cloud-free": {
      layout: false,
      pageRange: false,
      imageAnalysis: false,
    },
  },
  fields: [
    {
      key: "kitCommand",
      label: "mineru-kit command",
      kind: "text",
      description: "Executable name or absolute path for MinerU 4.",
      placeholder: "mineru-kit",
      routes: ["auto", "local-cli", "local-api"],
    },
    {
      key: "localApiUrl",
      label: "Local API URL",
      kind: "text",
      placeholder: "http://127.0.0.1:8000",
      description: 'Start it with "mineru-kit api-server --port 8000".',
      routes: ["auto", "local-api"],
    },
    {
      key: "apiBaseUrl",
      label: "Cloud API base URL",
      kind: "text",
      placeholder: "https://mineru.net",
      routes: ["cloud-token", "cloud-free"],
    },
    {
      key: "apiToken",
      label: "Cloud API token",
      kind: "password",
      description: "Required for the token route. Stored in plugin settings.",
      routes: ["cloud-token"],
    },
    {
      key: "tier",
      label: "Model tier",
      kind: "select",
      options: [
        { label: "Flash (fastest)", value: "flash" },
        { label: "Basic", value: "basic" },
        { label: "Standard", value: "standard" },
        { label: "Advanced", value: "advanced" },
      ],
      routes: ["auto", "local-cli", "local-api"],
    },
    {
      key: "ocrMode",
      label: "OCR mode",
      kind: "select",
      options: [
        { label: "Auto", value: "auto" },
        { label: "Text layer", value: "txt" },
        { label: "Force OCR", value: "ocr" },
      ],
      routes: ["auto", "local-cli", "local-api"],
    },
    {
      key: "remoteUrl",
      label: "Remote parse URL",
      kind: "text",
      description: "Extra mineru-kit server passed through --remote-url.",
      placeholder: "http://host:8000",
      routes: ["auto", "local-cli"],
    },
    {
      key: "remoteApiKey",
      label: "Remote API key",
      kind: "password",
      routes: ["auto", "local-cli"],
    },
    {
      key: "extraArgs",
      label: "Extra CLI arguments",
      kind: "text",
      description: "Appended to mineru-kit parse. Quoting follows the shell.",
      routes: ["auto", "local-cli", "local-api"],
    },
  ],
  configDefaults: engineConfigDefaults("mineru"),
  pythonPackage: "mineru",
  operations: [
    {
      id: "cli.install",
      label: "Install",
      description:
        "Installs MinerU with uv. Leave the version empty for the latest release from the configured package index.",
      requiresConfirmation: true,
      showWhen: "always",
      options: [VERSION_OPTION],
    },
    {
      id: "cli.reinstall",
      label: "Repair / reinstall",
      description:
        "Reinstalls MinerU with uv, optionally pinned to a specific version.",
      requiresConfirmation: true,
      showWhen: "always",
      options: [VERSION_OPTION],
    },
    {
      id: "cli.update",
      label: "Update",
      description: "Updates MinerU to the latest release with uv.",
      requiresConfirmation: false,
      showWhen: "update-available",
      options: [],
    },
    {
      id: "cli.uninstall",
      label: "Uninstall",
      description:
        "Removes the MinerU tool with uv. Downloaded models are kept.",
      requiresConfirmation: true,
      showWhen: "installed",
      options: [],
    },
    {
      id: "models.download",
      label: "Download models",
      description: "Downloads the MinerU model set for a tier.",
      requiresConfirmation: false,
      showWhen: "always",
      options: [
        {
          key: "tier",
          label: "Tier",
          kind: "select",
          defaultValue: "standard",
          options: [
            { label: "Basic", value: "basic" },
            { label: "Standard", value: "standard" },
          ],
        },
        {
          key: "source",
          label: "Source",
          kind: "select",
          defaultValue: "auto",
          options: [
            { label: "Auto", value: "auto" },
            { label: "Hugging Face", value: "huggingface" },
            { label: "ModelScope", value: "modelscope" },
          ],
        },
      ],
    },
    {
      id: "models.clear",
      label: "Clear model cache",
      description:
        "Deletes the downloaded MinerU models from their cache directory. They re-download on next use.",
      requiresConfirmation: true,
      showWhen: "models-present",
      options: [],
    },
  ],
};

const DOCLING_DESCRIPTOR: AiTextEngineDescriptor = {
  id: "docling",
  label: "Docling",
  description:
    "IBM Docling extraction with the standard layout pipeline or a VLM pipeline. Produces Markdown, page geometry, and figure images.",
  formats: ["pdf"],
  capabilities: {
    layout: true,
    assets: true,
    ocr: true,
    formula: true,
    tables: true,
    language: true,
    pageRange: false,
    imageAnalysis: false,
    localInstall: true,
  },
  routes: [
    {
      id: "standard",
      label: "Standard",
      description:
        "Layout, TableFormer, and OCR models. Best default for mixed text and scanned pages.",
      kind: "local",
    },
    {
      id: "vlm",
      label: "VLM",
      description:
        "Runs a vision-language model over page images. Slower and downloads a large model.",
      kind: "local",
    },
  ],
  defaultRoute: "standard",
  // Standard always builds tables, so the switch has nothing to turn off.
  // The VLM pipeline reads pages as images and ignores the OCR, formula,
  // table, and language flags.
  routeCapabilities: {
    standard: { tables: false },
    vlm: { ocr: false, formula: false, tables: false, language: false },
  },
  fields: [
    {
      key: "doclingCommand",
      label: "docling command",
      kind: "text",
      placeholder: "docling",
      description: "Executable name or absolute path for Docling 2.x.",
    },
    {
      key: "doclingToolsCommand",
      label: "docling-tools command",
      kind: "text",
      placeholder: "docling-tools",
      description: "Used for model downloads.",
    },
    {
      key: "artifactsPath",
      label: "Artifacts / model path",
      kind: "text",
      description:
        "Optional --artifacts-path. Leave empty to use Docling's cache (~/.cache/docling/models).",
    },
    {
      key: "device",
      label: "Device",
      kind: "select",
      options: [
        { label: "Auto", value: "auto" },
        { label: "CPU", value: "cpu" },
        { label: "CUDA", value: "cuda" },
        { label: "Metal (mps)", value: "mps" },
      ],
    },
    {
      key: "numThreads",
      label: "CPU threads",
      kind: "number",
      min: 0,
      max: 128,
      step: 1,
      description: "0 lets Docling choose.",
    },
    {
      key: "ocrEngine",
      label: "OCR engine",
      kind: "select",
      options: [
        { label: "Docling default", value: "" },
        { label: "EasyOCR", value: "easyocr" },
        { label: "RapidOCR", value: "rapidocr" },
        { label: "Tesseract", value: "tesseract" },
        { label: "TesserOCR", value: "tesserocr" },
        { label: "macOS Vision", value: "ocrmac" },
      ],
      description:
        "Empty uses Docling's platform default. Availability depends on the Docling install.",
      routes: ["standard"],
    },
    {
      key: "ocrLangs",
      label: "OCR languages",
      kind: "text",
      placeholder: "en, de",
      description: "Comma-separated language tags passed as --ocr-lang.",
      routes: ["standard"],
    },
    {
      key: "tableMode",
      label: "Table mode",
      kind: "select",
      options: [
        { label: "Accurate", value: "accurate" },
        { label: "Fast", value: "fast" },
      ],
      routes: ["standard"],
    },
    {
      key: "vlmModel",
      label: "VLM model",
      kind: "text",
      placeholder: "granite_docling",
      description: "Used by the VLM pipeline only.",
      routes: ["vlm"],
    },
    {
      key: "extraArgs",
      label: "Extra CLI arguments",
      kind: "text",
      description: "Appended to the docling convert command.",
    },
  ],
  configDefaults: engineConfigDefaults("docling"),
  pythonPackage: "docling",
  operations: [
    {
      id: "cli.install",
      label: "Install",
      description:
        "Installs Docling with uv. Leave the version empty for the latest release from the configured package index.",
      requiresConfirmation: true,
      showWhen: "always",
      options: [VERSION_OPTION],
    },
    {
      id: "cli.reinstall",
      label: "Repair / reinstall",
      description:
        "Reinstalls Docling with uv, optionally pinned to a specific version.",
      requiresConfirmation: true,
      showWhen: "always",
      options: [VERSION_OPTION],
    },
    {
      id: "cli.update",
      label: "Update",
      description: "Updates Docling to the latest release with uv.",
      requiresConfirmation: false,
      showWhen: "update-available",
      options: [],
    },
    {
      id: "cli.uninstall",
      label: "Uninstall",
      description:
        "Removes the Docling tool with uv. Downloaded models are kept.",
      requiresConfirmation: true,
      showWhen: "installed",
      options: [],
    },
    {
      id: "models.download",
      label: "Download models",
      description:
        "Downloads Docling's default model set, plus the Granite Docling VLM model when requested.",
      requiresConfirmation: false,
      showWhen: "always",
      options: [
        {
          key: "includeVlm",
          label: "Include VLM model",
          kind: "select",
          defaultValue: "false",
          options: [
            { label: "No", value: "false" },
            { label: "Yes (granitedocling)", value: "true" },
          ],
        },
      ],
    },
    {
      id: "models.clear",
      label: "Clear model cache",
      description:
        "Deletes the downloaded Docling models from their cache directory. They re-download on next use.",
      requiresConfirmation: true,
      showWhen: "models-present",
      options: [],
    },
  ],
};

const LOCAL_OCR_DESCRIPTOR: AiTextEngineDescriptor = {
  id: "local-ocr",
  label: "Offline text extraction",
  description:
    "Built-in PDF text extraction with Poppler and on-device OCR. No install and no layout geometry; used as the offline fallback.",
  formats: ["pdf"],
  capabilities: {
    layout: false,
    assets: false,
    ocr: true,
    formula: false,
    tables: true,
    language: false,
    pageRange: false,
    imageAnalysis: false,
    localInstall: false,
  },
  routes: [
    {
      id: "auto",
      label: "Local",
      description: "Reads the text layer and falls back to on-device OCR.",
      kind: "builtin",
    },
  ],
  defaultRoute: "auto",
  routeCapabilities: {},
  fields: [],
  configDefaults: engineConfigDefaults("local-ocr"),
  pythonPackage: null,
  operations: [],
};

export const AI_TEXT_ENGINE_CATALOG: readonly AiTextEngineDescriptor[] = [
  aiTextEngineDescriptorSchema.parse(MINERU_DESCRIPTOR),
  aiTextEngineDescriptorSchema.parse(DOCLING_DESCRIPTOR),
  aiTextEngineDescriptorSchema.parse(LOCAL_OCR_DESCRIPTOR),
];

export function getAiTextEngineDescriptor(
  engineId: string,
): AiTextEngineDescriptor | null {
  return AI_TEXT_ENGINE_CATALOG.find((engine) => engine.id === engineId) ?? null;
}
