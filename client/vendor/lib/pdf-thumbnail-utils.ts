import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models"

const PDFIUM_VERSION = "2.15.0"
const PDFIUM_WASM_URL = `https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@${PDFIUM_VERSION}/dist/pdfium.wasm`

let sharedEnginePromise: Promise<PdfEngine> | null = null
const pdfDocumentCache = new Map<string, Promise<PdfDocumentObject>>()
const thumbnailUrlCache = new Map<string, Promise<string | null>>()
let customWasmResolver: (() => Promise<string>) | null = null

export function setPdfiumWasmResolver(resolver: () => Promise<string>) {
  customWasmResolver = resolver
}

export function loadSharedPdfEngine() {
  if (!sharedEnginePromise) {
    sharedEnginePromise = (async () => {
      let wasmUrl = PDFIUM_WASM_URL
      if (customWasmResolver) {
        try {
          wasmUrl = await customWasmResolver()
        } catch {
          wasmUrl = PDFIUM_WASM_URL
        }
      }
      const { createPdfiumEngine } = await import(
        "@embedpdf/engines/pdfium-worker-engine"
      )
      return createPdfiumEngine(wasmUrl, {})
    })().catch((err) => {
      sharedEnginePromise = null
      throw err
    })
  }

  return sharedEnginePromise
}

export async function loadPdfDocument(url: string) {
  let documentPromise = pdfDocumentCache.get(url)

  if (!documentPromise) {
    documentPromise = loadSharedPdfEngine()
      .then((engine) =>
        engine
          .openDocumentUrl(
            { id: url, url },
            { mode: url.startsWith("blob:") ? "full-fetch" : "auto" }
          )
          .toPromise()
      )
      .catch((err) => {
        pdfDocumentCache.delete(url)
        throw err
      })
    pdfDocumentCache.set(url, documentPromise)
  }

  return documentPromise
}

export async function getPdfPageCount(url: string) {
  return (await loadPdfDocument(url)).pageCount
}

export function renderPdfThumbnailUrl({
  dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  pageIndex,
  url,
  width,
}: {
  dpr?: number
  pageIndex: number
  url: string
  width: number
}) {
  const cacheKey = `${url}#${pageIndex}@${width}x${dpr}`
  let thumbnailPromise = thumbnailUrlCache.get(cacheKey)

  if (!thumbnailPromise) {
    thumbnailPromise = (async () => {
      const [engine, document] = await Promise.all([
        loadSharedPdfEngine(),
        loadPdfDocument(url),
      ])
      const page = document.pages[pageIndex]

      if (!page) return null

      const blob = await engine
        .renderThumbnail(document, page, {
          dpr,
          imageType: "image/png",
          scaleFactor: width / page.size.width,
          withAnnotations: true,
        })
        .toPromise()

      return URL.createObjectURL(blob)
    })().catch((err) => {
      thumbnailUrlCache.delete(cacheKey)
      throw err
    })
    thumbnailUrlCache.set(cacheKey, thumbnailPromise)
  }

  return thumbnailPromise
}
