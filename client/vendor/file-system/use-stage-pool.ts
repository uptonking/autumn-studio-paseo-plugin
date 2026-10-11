import * as React from "react"

import {
  GALLERY_STAGE_ATTACHED_COUNT,
  GALLERY_STAGE_POOL_SIZE,
  type FileEntry,
  type FileSystemIndex,
  type FileSystemViewerKind,
} from "./types"

export function useStagePool({
  index,
  openedFile,
}: {
  index: FileSystemIndex
  openedFile: {
    file: FileEntry
    kind: FileSystemViewerKind
    mode: "in-place" | "dialog"
    url: string
  } | null
}) {
  const [stagePool, setStagePool] = React.useState<string[]>([])
  const [stageRecency] = React.useState(() => new Map<string, number>())
  const stageClockRef = React.useRef(0)
  const [stageContainers] = React.useState(
    () => new Map<string, HTMLDivElement>()
  )
  const [stageHosts] = React.useState(() => new Map<string, HTMLElement>())
  const [, bumpStageHosts] = React.useState(0)
  const [stageVersion, setStageVersion] = React.useState(0)
  const [dialogStageHost, setDialogStageHost] =
    React.useState<HTMLElement | null>(null)
  const [inPlaceStageHost, setInPlaceStageHost] =
    React.useState<HTMLElement | null>(null)

  const registerStageHost = React.useCallback(
    (path: string, element: HTMLElement | null) => {
      if (element) {
        if (stageHosts.get(path) === element) return
        stageHosts.set(path, element)
      } else {
        if (!stageHosts.has(path)) return
        stageHosts.delete(path)
      }
      bumpStageHosts((version) => version + 1)
    },
    [stageHosts]
  )

  const dialogStageHostRef = React.useCallback(
    (element: HTMLDivElement | null) => setDialogStageHost(element),
    []
  )

  const inPlaceStageHostRef = React.useCallback(
    (element: HTMLDivElement | null) => setInPlaceStageHost(element),
    []
  )

  const poolStagePath = React.useCallback(
    (path: string) => {
      if (!index.files.has(path)) return
      if (!stageContainers.has(path)) {
        const container = document.createElement("div")

        container.className =
          "flex size-full min-h-0 min-w-0 items-center justify-center contain-layout contain-paint"
        stageContainers.set(path, container)
      }

      stageRecency.set(path, ++stageClockRef.current)
      setStageVersion((version) => version + 1)
      setStagePool((previous) => {
        if (previous.includes(path)) return previous

        const next = [...previous, path]

        if (next.length <= GALLERY_STAGE_POOL_SIZE) return next

        let evicted = next[0]

        for (const candidate of next) {
          if (candidate === path) continue
          if (
            (stageRecency.get(candidate) ?? 0) <
            (stageRecency.get(evicted) ?? 0)
          ) {
            evicted = candidate
          }
        }
        return next.filter((candidate) => candidate !== evicted)
      })
    },
    [index, stageContainers, stageRecency]
  )

  const activeViewerStagePath = openedFile ? openedFile.file.path : null
  const activeViewerStageHost =
    openedFile?.mode === "dialog"
      ? dialogStageHost
      : openedFile?.mode === "in-place"
        ? inPlaceStageHost
        : null

  const attachedStagePaths = React.useMemo(() => {
    void stageVersion

    const attached = [...stagePool]
      .sort((a, b) => (stageRecency.get(b) ?? 0) - (stageRecency.get(a) ?? 0))
      .slice(0, GALLERY_STAGE_ATTACHED_COUNT)

    if (
      activeViewerStagePath &&
      stagePool.includes(activeViewerStagePath) &&
      !attached.includes(activeViewerStagePath)
    ) {
      attached.push(activeViewerStagePath)
    }
    return attached
  }, [activeViewerStagePath, stagePool, stageRecency, stageVersion])

  React.useLayoutEffect(() => {
    for (const [path, container] of stageContainers) {
      if (!stagePool.includes(path)) {
        container.remove()
        stageContainers.delete(path)
        continue
      }
      if (activeViewerStagePath === path) {
        if (
          activeViewerStageHost &&
          container.parentElement !== activeViewerStageHost
        ) {
          activeViewerStageHost.appendChild(container)
        }
        continue
      }

      const target = attachedStagePaths.includes(path)
        ? (stageHosts.get(path) ?? null)
        : null

      if (!target) {
        if (container.parentElement) container.remove()
      } else if (container.parentElement !== target) {
        target.appendChild(container)
      }
    }
  })

  return {
    attachedStagePaths,
    dialogStageHostRef,
    inPlaceStageHostRef,
    poolStagePath,
    registerStageHost,
    stageContainers,
    stagePool,
  }
}
