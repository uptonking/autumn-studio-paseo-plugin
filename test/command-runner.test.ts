import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../server/ai-text/command-runner.ts";

describe("command-runner: streaming logs", () => {
  it("treats carriage-return redraws as separate log lines", async () => {
    const lines: string[] = [];
    const result = await runProcess({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('Downloading 10%\\rDownloading 55%\\rDownloading 100%\\nDone\\n')",
      ],
      onLog: (line) => lines.push(line),
    });

    assert.equal(result.code, 0);
    assert.deepEqual(lines, [
      "Downloading 10%",
      "Downloading 55%",
      "Downloading 100%",
      "Done",
    ]);
  });

  it("caps a single emitted line and still flushes the tail", async () => {
    const lines: string[] = [];
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(20000) + '\\n')"],
      onLog: (line) => lines.push(line),
    });

    assert.equal(result.code, 0);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.length, 8 * 1024);
    assert.equal(lines[0]!.endsWith("x"), true);
  });

  it("keeps only the newest progress update for percent parsing", async () => {
    const lines: string[] = [];
    await runProcess({
      command: process.execPath,
      args: [
        "-e",
        "for (let i = 0; i <= 100; i += 10) process.stdout.write(`progress ${i}%\\r`)",
      ],
      onLog: (line) => lines.push(line),
    });

    assert.deepEqual(lines.at(-1), "progress 100%");
  });
});
