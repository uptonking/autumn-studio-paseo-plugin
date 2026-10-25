import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { FileViewerContent } from './file-viewer-content.js';
import { ShadowIsland } from './shadow-island.web.js';
import type { FileViewerViewProps } from './view-props.js';

export function FileViewerIsland(props: PluginWorkspacePanelProps & { view: FileViewerViewProps }) {
  return (
    <ShadowIsland theme={props.theme}>
      <FileViewerContent view={props.view} />
    </ShadowIsland>
  );
}
