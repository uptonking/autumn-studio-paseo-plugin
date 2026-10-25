import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { ExplorerContent } from "./explorer-content.js";
import { ShadowIsland } from "./shadow-island.web.js";
import { preloadFileSystemView } from "./vendor/file-system.js";
import type { ExplorerViewProps } from "./view-props.js";

export function ExplorerIsland(
  props: PluginWorkspacePanelProps & { view: ExplorerViewProps },
) {
  preloadFileSystemView(props.view.defaultViewMode ?? "list");
  return (
    <ShadowIsland theme={props.theme}>
      <ExplorerContent view={props.view} />
    </ShadowIsland>
  );
}
