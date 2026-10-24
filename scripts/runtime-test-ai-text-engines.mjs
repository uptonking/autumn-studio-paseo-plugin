// Runtime-test engine descriptors: JSON-safe mirrors of the shared
// engine catalog, kept here so the mocks file stays under the line cap.

function capabilities(overrides = {}) {
  return {
    layout: false,
    assets: false,
    ocr: false,
    formula: false,
    tables: false,
    language: false,
    pageRange: false,
    imageAnalysis: false,
    localInstall: false,
    ...overrides,
  };
}

export const ENGINE_DESCRIPTORS = [
  {
    id: "mineru",
    label: "MinerU",
    description: "Layout-aware PDF extraction with OCR and tables.",
    formats: ["pdf"],
    capabilities: capabilities({
      layout: true,
      assets: true,
      ocr: true,
      formula: true,
      tables: true,
      language: true,
      pageRange: true,
      imageAnalysis: true,
      localInstall: true,
    }),
    routes: [
      { id: "auto", label: "Auto", description: "", kind: "auto" },
      { id: "local-cli", label: "Local CLI", description: "", kind: "local" },
      { id: "local-api", label: "Local API", description: "", kind: "local" },
      { id: "cloud-token", label: "Cloud API (token)", description: "", kind: "cloud" },
      { id: "cloud-free", label: "Cloud API (free)", description: "", kind: "cloud" },
    ],
    defaultRoute: "auto",
    fields: [],
    configDefaults: {},
    pythonPackage: "mineru",
    operations: [
      {
        id: "cli.install",
        label: "Install",
        description: "Installs MinerU with uv.",
        requiresConfirmation: true,
        showWhen: "always",
        options: [
          { key: "version", label: "Version (blank = latest)", kind: "text", defaultValue: "", options: [] },
        ],
      },
      {
        id: "cli.reinstall",
        label: "Repair / reinstall",
        description: "Reinstalls the CLI.",
        requiresConfirmation: true,
        showWhen: "always",
        options: [],
      },
      {
        id: "cli.update",
        label: "Update",
        description: "Updates the CLI.",
        requiresConfirmation: false,
        showWhen: "update-available",
        options: [],
      },
      {
        id: "cli.uninstall",
        label: "Uninstall",
        description: "Removes the CLI; models are kept.",
        requiresConfirmation: true,
        showWhen: "installed",
        options: [],
      },
      {
        id: "models.download",
        label: "Download models",
        description: "Downloads models.",
        requiresConfirmation: false,
        showWhen: "always",
        options: [],
      },
      {
        id: "models.clear",
        label: "Clear model cache",
        description: "Deletes cached models.",
        requiresConfirmation: true,
        showWhen: "models-present",
        options: [],
      },
    ],
  },
  {
    id: "docling",
    label: "Docling",
    description: "Docling layout and table extraction.",
    formats: ["pdf"],
    capabilities: capabilities({
      layout: true,
      assets: true,
      ocr: true,
      formula: true,
      tables: true,
      language: true,
      localInstall: true,
    }),
    routes: [
      { id: "standard", label: "Standard", description: "", kind: "local" },
      { id: "vlm", label: "VLM", description: "", kind: "local" },
    ],
    defaultRoute: "standard",
    fields: [],
    configDefaults: {},
    pythonPackage: "docling",
    operations: [
      {
        id: "cli.install",
        label: "Install",
        description: "Installs Docling with uv.",
        requiresConfirmation: true,
        showWhen: "always",
        options: [
          { key: "version", label: "Version (blank = latest)", kind: "text", defaultValue: "", options: [] },
        ],
      },
      {
        id: "cli.update",
        label: "Update",
        description: "Updates the CLI.",
        requiresConfirmation: false,
        showWhen: "update-available",
        options: [],
      },
      {
        id: "cli.uninstall",
        label: "Uninstall",
        description: "Removes the CLI; models are kept.",
        requiresConfirmation: true,
        showWhen: "installed",
        options: [],
      },
      {
        id: "models.download",
        label: "Download models",
        description: "Downloads models.",
        requiresConfirmation: false,
        showWhen: "always",
        options: [],
      },
      {
        id: "models.clear",
        label: "Clear model cache",
        description: "Deletes cached models.",
        requiresConfirmation: true,
        showWhen: "models-present",
        options: [],
      },
    ],
  },
  {
    id: "local-ocr",
    label: "Offline text extraction",
    description: "Offline PDF text layer and on-device OCR.",
    formats: ["pdf"],
    capabilities: capabilities({ ocr: true, tables: true }),
    routes: [
      { id: "auto", label: "Local", description: "", kind: "builtin" },
    ],
    defaultRoute: "auto",
    fields: [],
    configDefaults: {},
    operations: [],
  },
];


export const runtimePaseoApi = {
  workspaces: {
    list: async () => ({
      entries: [
        {
          id: "ws_runtime",
          name: "Runtime Workspace",
          title: "Runtime Workspace",
        },
      ],
    }),
  },
  agents: {
    list: async () => ({
      entries: [
        {
          agent: {
            workspaceId: "ws_runtime",
            updatedAt: "2026-10-24T00:00:00.000Z",
          },
        },
      ],
    }),
  },
};
