import type { SettingsSectionDescriptor } from "../registry.js";
import { aiTextSectionDescriptor } from "./ai-text-section.js";
import { generalSectionDescriptor } from "./general-section.js";
import { imageSectionDescriptor } from "./image-section.js";
import { pdfSectionDescriptor } from "./pdf-section.js";
import { textSectionDescriptor } from "./text-section.js";
import { xlsxSectionDescriptor } from "./xlsx-section.js";

/**
 * Ordered registry of settings sections for `autumn-studio-paseo-plugin`.
 * Future file viewers/editors (e.g. Office DOCX/PPTX, Images)
 * can add a section descriptor here without changing the settings page shell.
 */
const registeredSections: SettingsSectionDescriptor[] = [
  generalSectionDescriptor,
  pdfSectionDescriptor,
  aiTextSectionDescriptor,
  xlsxSectionDescriptor,
  textSectionDescriptor,
  imageSectionDescriptor,
];

export function registerSettingsSection(
  descriptor: SettingsSectionDescriptor,
): () => void {
  const existingIdx = registeredSections.findIndex(
    (s) => s.id === descriptor.id,
  );
  if (existingIdx !== -1) {
    registeredSections.splice(existingIdx, 1, descriptor);
  } else {
    registeredSections.push(descriptor);
  }
  return () => {
    const idx = registeredSections.indexOf(descriptor);
    if (idx !== -1) registeredSections.splice(idx, 1);
  };
}

export function getSettingsSections(): readonly SettingsSectionDescriptor[] {
  return [...registeredSections].sort((a, b) => a.order - b.order);
}
