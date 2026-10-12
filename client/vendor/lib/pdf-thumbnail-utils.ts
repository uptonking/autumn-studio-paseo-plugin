import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models"

const PDFIUM_VERSION = "2.15.0"
const PDFIUM_WASM_URL = `https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@${PDFIUM_VERSION}/dist/pdfium.wasm`
const MAX_CACHED_PDF_DOCUMENTS = 16
const MAX_CACHED_THUMBNAIL_URLS = 96

let sharedEnginePromise: Promise<PdfEngine> | null = null
const pdfDocumentCache = new Map<string, Promise<PdfDocumentObject>>()
const thumbnailUrlCache = new Map<string, Promise<string | null>>()
let customWasmResolver: (() => Promise<string>) | null = null

function revokeThumbnailPromiseUrl(promise: Promise<string | null>) {
  void promise
    .then((url) => {
      if (
        url &&
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(url)
      }
    })
    .catch(() => undefined)
}

function closeCachedPdfDocument(promise: Promise<PdfDocumentObject>) {
  if (!sharedEnginePromise) return
  void Promise.all([sharedEnginePromise, promise])
    .then(([engine, doc]) => {
      const maybeClose = (
        engine as unknown as {
          closeDocument?: (
            doc: PdfDocumentObject
          ) => { toPromise?: () => Promise<unknown> } | undefined
        }
      ).closeDocument
      return maybeClose?.(doc)?.toPromise?.()
    })
    .catch(() => undefined)
}

function touchLruMap<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
  onEvict?: (evictedValue: V, evictedKey: K) => void
) {
  if (map.has(key)) {
    map.delete(key)
  }
  map.set(key, value)
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value
    if (oldestKey === undefined) break
    const oldestValue = map.get(oldestKey)
    map.delete(oldestKey)
    if (oldestValue !== undefined) {
      onEvict?.(oldestValue, oldestKey)
    }
  }
}

export function setPdfiumWasmResolver(resolver: () => Promise<string>) {
  customWasmResolver = resolver
}

export function clearPdfThumbnailCaches() {
  for (const promise of thumbnailUrlCache.values()) {
    revokeThumbnailPromiseUrl(promise)
  }
  thumbnailUrlCache.clear()
  for (const promise of pdfDocumentCache.values()) {
    closeCachedPdfDocument(promise)
  }
  pdfDocumentCache.clear()
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

  if (documentPromise) {
    touchLruMap(
      pdfDocumentCache,
      url,
      documentPromise,
      MAX_CACHED_PDF_DOCUMENTS,
      closeCachedPdfDocument
    )
    return documentPromise
  }

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
  touchLruMap(
    pdfDocumentCache,
    url,
    documentPromise,
    MAX_CACHED_PDF_DOCUMENTS,
    closeCachedPdfDocument
  )

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

  if (thumbnailPromise) {
    touchLruMap(
      thumbnailUrlCache,
      cacheKey,
      thumbnailPromise,
      MAX_CACHED_THUMBNAIL_URLS,
      revokeThumbnailPromiseUrl
    )
    return thumbnailPromise
  }

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
  touchLruMap(
    thumbnailUrlCache,
    cacheKey,
    thumbnailPromise,
    MAX_CACHED_THUMBNAIL_URLS,
    revokeThumbnailPromiseUrl
  )

  return thumbnailPromise
}
