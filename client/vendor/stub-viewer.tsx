/**
 * Stand-in for the extend-ui DOCX/PPTX/XLSX preview components. Those viewers
 * depend on @extend-ai packages that are not vendored yet; file-system.tsx
 * lazy-imports them for viewerKind docx/pptx/xlsx. This keeps the plugin
 * bundle small and shows an honest message until they land.
 */
export function DocxViewerPreview(props: {
  className?: string
  fileName?: string
  [key: string]: unknown
}) {
  return <UnsupportedViewer fileName={props.fileName} kind="DOCX" />
}

export function PptxViewerPreview(props: {
  className?: string
  fileName?: string
  [key: string]: unknown
}) {
  return <UnsupportedViewer fileName={props.fileName} kind="PPTX" />
}

export function XlsxViewerPreview(props: {
  className?: string
  fileName?: string
  [key: string]: unknown
}) {
  return <UnsupportedViewer fileName={props.fileName} kind="XLSX" />
}

function UnsupportedViewer({ fileName, kind }: { fileName?: string; kind: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        {kind} preview is coming soon
      </p>
      {fileName ? (
        <p className="text-xs text-muted-foreground">{fileName}</p>
      ) : null}
    </div>
  )
}
