import { execCommand } from "@getpaseo/plugin/server";
import { stat } from "node:fs/promises";

const REVEAL_TIMEOUT_MS = 10_000;

/** Platform opener command for revealing a directory in the file manager. */
export function buildRevealCommand(
  platform: NodeJS.Platform,
  targetPath: string,
): { command: string; args: string[] } {
  if (platform === "darwin") {
    return { command: "open", args: ["-R", targetPath] };
  }
  if (platform === "win32") {
    return { command: "explorer", args: [`/select,${targetPath}`] };
  }
  return { command: "xdg-open", args: [targetPath] };
}

/**
 * Opens a plugin-resolved directory in the OS file manager. The host SDK has
 * no reveal API, so this shells out to the platform opener; callers must pass
 * a path they resolved server-side, never a client-supplied one.
 */
export async function openPathInFileManager(
  targetPath: string,
): Promise<{ opened: boolean; message: string }> {
  try {
    const info = await stat(targetPath);
    if (!info.isDirectory()) {
      return {
        opened: false,
        message: `"${targetPath}" is not a directory (yet).`,
      };
    }
  } catch {
    return {
      opened: false,
      message: `"${targetPath}" does not exist yet — parse a file first.`,
    };
  }

  const { command, args } = buildRevealCommand(process.platform, targetPath);
  try {
    await execCommand(command, args, { timeout: REVEAL_TIMEOUT_MS });
    return { opened: true, message: `Opened ${targetPath}` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      opened: false,
      message: `Could not open the file manager for ${targetPath}: ${reason}`,
    };
  }
}
