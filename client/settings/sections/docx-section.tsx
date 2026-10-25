import { useCallback } from 'react';
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from '@getpaseo/plugin/client/ui';
import {
  DEFAULT_DOCX_SETTINGS,
  getDocxSettings,
  withDocxSettings,
  type DocxFlowMode,
} from '../../../shared/settings.js';
import { FormatOpenBehaviorFields } from '../components/format-open-behavior-fields.js';
import type { SettingsSectionComponentProps, SettingsSectionDescriptor } from '../registry.js';

const DOCX_FLOW_MODE_OPTIONS: readonly { label: string; value: DocxFlowMode }[] = [
  { label: 'Paginated (Default)', value: 'paginated' },
  { label: 'Web (continuous)', value: 'web' },
];

export function DocxSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const docx = getDocxSettings(values);
  const controlsDisabled = disabled || !general.enabled;

  const handleDefaultFlowModeChange = useCallback(
    (defaultFlowMode: DocxFlowMode) => {
      updateValues((current) => withDocxSettings(current, { defaultFlowMode }));
    },
    [updateValues],
  );

  const handleDownloadButtonChange = useCallback(
    (showDownloadButton: boolean) => {
      updateValues((current) => withDocxSettings(current, { showDownloadButton }));
    },
    [updateValues],
  );

  return (
    <SettingsSection title='Docx/Doc' testID='autumn-studio-settings-docx'>
      <SettingsCard>
        <FormatOpenBehaviorFields
          kind='docx'
          formatLabel='Word'
          values={values}
          disabled={controlsDisabled}
          updateValues={updateValues}
        />
        <SettingsSelect
          label='Default document layout'
          hint='Initial Begonia editor layout when a Word (.docx) document opens: paginated pages or a continuous web flow.'
          value={docx.defaultFlowMode}
          options={DOCX_FLOW_MODE_OPTIONS}
          disabled={controlsDisabled}
          onValueChange={handleDefaultFlowModeChange}
          testID='autumn-studio-setting-docx-flow-mode'
        />
        <SettingsSwitch
          label='Show download action'
          hint='Include the Export / Download options in the Word document toolbar.'
          value={docx.showDownloadButton}
          disabled={controlsDisabled}
          onValueChange={handleDownloadButtonChange}
          testID='autumn-studio-setting-docx-download'
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const docxSectionDescriptor: SettingsSectionDescriptor = {
  id: 'docx',
  title: 'Docx/Doc',
  order: 22,
  sidebarGroup: 'primary',
  formatKind: 'docx',
  extensions: ['.docx'],
  description:
    'Default Word document viewer/editor engines and the initial paginated or web layout.',
  resetSection: (current) => ({
    ...current,
    docx: { ...DEFAULT_DOCX_SETTINGS },
  }),
  Component: DocxSettingsSection,
};
