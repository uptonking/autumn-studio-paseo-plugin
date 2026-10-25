import { Text, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';

/**
 * States the platform contract in the General settings section: the viewer
 * stack runs on desktop and web only. Settings screens are native, so mobile
 * users see the warning variant here.
 */
export function PlatformSupportNotice({
  theme,
  platform,
}: {
  theme: PluginTheme;
  platform?: 'ios' | 'android' | 'web';
}) {
  const isWeb = platform !== 'ios' && platform !== 'android';
  return (
    <View
      testID='autumn-studio-platform-support-notice'
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: isWeb ? theme.colors.border : theme.colors.statusWarning,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Text
        style={{
          color: isWeb ? theme.colors.foregroundMuted : theme.colors.statusWarning,
          fontSize: 13,
          fontWeight: isWeb ? '400' : '600',
        }}
      >
        {isWeb
          ? 'Autumn Studio viewer runs on desktop and web.'
          : 'Desktop/web only — the file tree and viewers do not render on mobile. These settings apply to desktop and web sessions.'}
      </Text>
    </View>
  );
}
