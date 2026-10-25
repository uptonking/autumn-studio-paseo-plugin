import { useCallback } from 'react';
import { SettingsCard, SettingsSection, SettingsSwitch } from '@getpaseo/plugin/client/ui';
import {
  DEFAULT_TEXT_VIEWER_SETTINGS,
  getTextViewerSettings,
  withTextViewerSettings,
} from '../../../shared/settings.js';
import { FormatOpenBehaviorFields } from '../components/format-open-behavior-fields.js';
import type { SettingsSectionComponentProps, SettingsSectionDescriptor } from '../registry.js';

export function TextSettingsSection({
  values,
  disabled,
  updateValues,
}: SettingsSectionComponentProps) {
  const { general } = values;
  const controlsDisabled = disabled || !general.enabled;
  const textSettings = getTextViewerSettings(values);

  const handleToggleLineNumbers = useCallback(
    (showLineNumbers: boolean) => {
      updateValues((prev) => withTextViewerSettings(prev, { showLineNumbers }));
    },
    [updateValues],
  );

  const handleToggleWordWrap = useCallback(
    (wordWrap: boolean) => {
      updateValues((prev) => withTextViewerSettings(prev, { wordWrap }));
    },
    [updateValues],
  );

  return (
    <SettingsSection title='Code & Text' testID='autumn-studio-settings-text'>
      <SettingsCard>
        <FormatOpenBehaviorFields
          kind='text'
          formatLabel='Code & Text'
          values={values}
          disabled={controlsDisabled}
          updateValues={updateValues}
        />
        <SettingsSwitch
          label='Show line numbers'
          hint='Display line numbers along the left gutter in text and code previews.'
          value={textSettings.showLineNumbers}
          disabled={controlsDisabled}
          onValueChange={handleToggleLineNumbers}
          testID='autumn-studio-setting-text-lines'
        />
        <SettingsSwitch
          label='Wrap long lines'
          hint='Soft-wrap lines that exceed the viewer width instead of scrolling horizontally.'
          value={textSettings.wordWrap}
          disabled={controlsDisabled}
          onValueChange={handleToggleWordWrap}
          testID='autumn-studio-setting-text-wrap'
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export const textSectionDescriptor: SettingsSectionDescriptor = {
  id: 'text',
  title: 'Code & Text',
  order: 30,
  sidebarGroup: 'more',
  formatKind: 'text',
  extensions: ['.md', '.txt', '.ts', '.tsx', '.js', '.json', '.py'],
  description:
    'Markdown, source code, and plain text viewer/editor engines, line numbers, and word wrap.',
  resetSection: (current) => ({
    ...current,
    text: { ...DEFAULT_TEXT_VIEWER_SETTINGS },
  }),
  Component: TextSettingsSection,
};
