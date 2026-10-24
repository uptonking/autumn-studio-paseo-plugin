import "./builtins.js";

export {
  getAiTextViewer,
  listAiTextViewers,
  registerAiTextViewer,
} from "./registry.js";
export {
  getAiTextViewerDescriptor,
  getDefaultableAiTextViewerDescriptors,
  listAiTextViewerDescriptors,
  registerAiTextViewerDescriptor,
} from "./catalog.js";
export type {
  AiTextViewerProps,
  AiTextViewerRegistration,
} from "./registry.js";
