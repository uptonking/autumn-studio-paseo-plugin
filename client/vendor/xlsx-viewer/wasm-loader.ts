let customXlsxWasmResolver: (() => Promise<ArrayBuffer | string>) | null = null;
let xlsxWasmInitPromise: Promise<void> | null = null;
let initializedWithCustomResolver = false;

function dataUriToArrayBuffer(dataUri: string): ArrayBuffer {
  const comma = dataUri.indexOf(",");
  if (comma === -1) {
    throw new Error("Invalid data URI for Excel WASM");
  }
  const b64 = dataUri.slice(comma + 1);
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    return copy.buffer;
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export function setXlsxWasmResolver(
  resolver: () => Promise<ArrayBuffer | string>,
): void {
  customXlsxWasmResolver = resolver;
  if (!initializedWithCustomResolver) {
    xlsxWasmInitPromise = null;
  }
}

export async function ensureXlsxWasmReady(): Promise<void> {
  if (!xlsxWasmInitPromise) {
    const usedCustomResolver = Boolean(customXlsxWasmResolver);
    initializedWithCustomResolver = usedCustomResolver;
    xlsxWasmInitPromise = (async () => {
      const { initWasm, setWasmSource } = await import("@extend-ai/react-xlsx");
      if (customXlsxWasmResolver) {
        const resolved = await customXlsxWasmResolver();
        const buffer =
          typeof resolved === "string"
            ? dataUriToArrayBuffer(resolved)
            : resolved;
        setWasmSource(buffer);
        await initWasm(buffer);
      } else {
        await initWasm();
      }
    })().catch((err) => {
      xlsxWasmInitPromise = null;
      initializedWithCustomResolver = false;
      throw err;
    });
  }
  return xlsxWasmInitPromise;
}

export async function fetchWorkbookArrayBuffer(
  src: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (src.startsWith("data:")) {
    return dataUriToArrayBuffer(src);
  }
  const response = await fetch(src, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load workbook (${response.status})`);
  }
  return await response.arrayBuffer();
}
