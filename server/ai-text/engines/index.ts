import { registerDoclingEngine } from './docling/index.ts';
import { registerLocalOcrEngine } from './local-ocr/index.ts';
import { registerMineruEngine } from './mineru/index.ts';

let registered = false;

/** Registers every bundled extraction engine exactly once per daemon. */
export function registerAiTextEngines(): void {
  if (registered) return;
  registered = true;
  registerMineruEngine();
  registerDoclingEngine();
  registerLocalOcrEngine();
}
