import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

function candidateNames(command: string): string[] {
  if (process.platform !== "win32") return [command];
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  return [command, ...extensions.map((ext) => `${command}${ext.toLowerCase()}`)];
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(
      filePath,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a CLI name against the daemon's PATH plus the usual install
 * locations. Daemons launched by a desktop shell often miss the user's shell
 * PATH, which is why `mineru-kit` is not found even though it runs in a
 * terminal.
 */
export async function resolveExecutable(
  command: string,
): Promise<string | null> {
  const trimmed = command.trim();
  if (!trimmed) return null;
  const expanded = expandHome(trimmed);

  if (expanded.includes("/") || expanded.includes("\\")) {
    const absolute = isAbsolute(expanded)
      ? expanded
      : join(process.cwd(), expanded);
    return (await isExecutable(absolute)) ? absolute : null;
  }

  const names = candidateNames(expanded);
  const searchDirs = [
    ...(process.env.PATH ?? "").split(delimiter),
    join(homedir(), ".local", "bin"),
    join(homedir(), ".local", "share", "uv", "tools", "mineru", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ].filter(Boolean);

  const seen = new Set<string>();
  for (const dir of searchDirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    for (const name of names) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return null;
}
