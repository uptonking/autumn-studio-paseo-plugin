import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { FileExplorerContent } from "./file-explorer-content.js";
import { ShadowIsland } from "./shadow-island.web.js";
import type { FileExplorerViewProps } from "./view-props.js";

export function FileExplorerIsland(
  props: PluginWorkspacePanelProps & { view: FileExplorerViewProps },
) {
  return (
    <ShadowIsland theme={props.theme}>
      <FileExplorerContent view={props.view} />
    </ShadowIsland>
  );
}
