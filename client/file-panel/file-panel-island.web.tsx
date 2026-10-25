import { useMemo } from 'react';
import type { PluginFilePanelProps } from '@getpaseo/plugin/client';
import { FileViewerFrame, FileViewerStage, type FileSourceAdapter } from '../file-viewer-stage.js';
import { ShadowIsland } from '../shadow-island.web.js';
import { FileSystemIconSpriteSheet } from '../vendor/file-system/icons.js';
import type { OpenedFileTab } from '../opened-tabs-store.js';
import type { FileViewerViewProps } from '../view-props.js';

/**
 * react-dom island for the native file panel: the shared single-file stage
 * (inside the full-height flex frame it needs) over a PluginFile-backed URL
 * source. Paseo owns the URL lifecycle, so a fresh `file.url()` resolves for
 * newer bytes and the stage's stat-keyed re-resolution picks it up.
 */
export function FilePanelIsland(
  props: PluginFilePanelProps & {
    view: FileViewerViewProps;
    activeTab: OpenedFileTab;
  },
) {
  const file = props.file;
  const source = useMemo<FileSourceAdapter>(
    () => ({
      getUrl: () => file.url(),
    }),
    [file],
  );

  return (
    <ShadowIsland theme={props.theme}>
      <FileViewerFrame>
        <FileSystemIconSpriteSheet />
        <FileViewerStage
          view={props.view}
          activeTab={props.activeTab}
          source={source}
          mode='native'
        />
      </FileViewerFrame>
    </ShadowIsland>
  );
}
