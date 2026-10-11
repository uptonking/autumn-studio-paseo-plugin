import { fileExtension, type FileEntry } from "./types"

const EXTENSION_MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  c: "text/x-c",
  cc: "text/x-c",
  cjs: "text/javascript",
  cpp: "text/x-c",
  css: "text/css",
  csv: "text/csv",
  cts: "text/x-typescript",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  go: "text/x-go",
  h: "text/x-c",
  hpp: "text/x-c",
  htm: "text/html",
  html: "text/html",
  java: "text/x-java",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  jsonc: "application/json",
  jsonl: "application/json",
  jsx: "text/jsx",
  kt: "text/x-kotlin",
  md: "text/markdown",
  mdx: "text/mdx",
  mjs: "text/javascript",
  mts: "text/x-typescript",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  py: "text/x-python",
  rb: "text/x-ruby",
  rs: "text/x-rust",
  sh: "application/x-sh",
  sql: "application/sql",
  svg: "image/svg+xml",
  swift: "text/x-swift",
  toml: "application/toml",
  ts: "text/x-typescript",
  tsv: "text/tab-separated-values",
  tsx: "text/x-typescript",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  zip: "application/zip",
  zsh: "application/x-sh",
}

const FALLBACK_MIME_TYPE = "application/octet-stream"

export const MIME_TYPE_LABELS: Record<string, string> = {
  [FALLBACK_MIME_TYPE]: "Binary",
  "application/json": "JSON",
  "application/msword": "Word document (legacy)",
  "application/pdf": "PDF",
  "application/sql": "SQL",
  "application/toml": "TOML",
  "application/vnd.ms-excel": "Excel workbook (legacy)",
  "application/vnd.ms-powerpoint": "PowerPoint (legacy)",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PowerPoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "Excel workbook",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word document",
  "application/x-sh": "Shell script",
  "application/xml": "XML",
  "application/zip": "ZIP archive",
  "image/avif": "AVIF image",
  "image/gif": "GIF image",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/svg+xml": "SVG image",
  "image/webp": "WebP image",
  "text/css": "CSS",
  "text/csv": "CSV",
  "text/html": "HTML",
  "text/javascript": "JavaScript",
  "text/jsx": "JSX",
  "text/markdown": "Markdown",
  "text/mdx": "MDX",
  "text/plain": "Plain text",
  "text/tab-separated-values": "TSV",
  "text/x-c": "C / C++",
  "text/x-go": "Go",
  "text/x-java": "Java",
  "text/x-kotlin": "Kotlin",
  "text/x-python": "Python",
  "text/x-ruby": "Ruby",
  "text/x-rust": "Rust",
  "text/x-swift": "Swift",
  "text/x-typescript": "TypeScript",
  "text/yaml": "YAML",
}

export function mimeTypeForFile(file: FileEntry) {
  const byExt = EXTENSION_MIME_TYPES[fileExtension(file.name)]
  if (file.contentType === "video/mp2t" && byExt) return byExt
  return file.contentType ?? byExt ?? FALLBACK_MIME_TYPE
}

export type FileSystemFilterType = "dateCreated" | "dateModified" | "fileType"

export type FileSystemDateFilterType = Exclude<FileSystemFilterType, "fileType">

export type FileSystemFilterOperator =
  | "after"
  | "before"
  | "in-range"
  | "is"
  | "is-any-of"
  | "is-not"
  | "not-in-range"

export type FileSystemFilter = {
  id: string
  operator: FileSystemFilterOperator
  type: FileSystemFilterType
  value: string[]
}

export type FileTypeFilterGroup =
  | "Documents"
  | "Spreadsheets"
  | "Images"
  | "Code"
  | "Text"
  | "Archives & binary"

export type FileTypeFilterOption = {
  group: FileTypeFilterGroup
  iconFileName: string
  label: string
  mime: string
}

export const FILE_TYPE_FILTER_GROUPS: FileTypeFilterGroup[] = [
  "Documents",
  "Spreadsheets",
  "Images",
  "Code",
  "Text",
  "Archives & binary",
]

export function fileTypeFilterGroup(mime: string): FileTypeFilterGroup {
  if (
    mime === "application/pdf" ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "Documents"
  }

  if (
    mime === "application/vnd.ms-excel" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "text/csv" ||
    mime === "text/tab-separated-values"
  ) {
    return "Spreadsheets"
  }

  if (mime.startsWith("image/")) return "Images"

  if (
    mime === "application/json" ||
    mime === "application/sql" ||
    mime === "application/toml" ||
    mime === "application/x-sh" ||
    mime === "application/xml" ||
    mime === "text/css" ||
    mime === "text/html" ||
    mime === "text/javascript" ||
    mime === "text/jsx" ||
    mime === "text/x-c" ||
    mime === "text/x-go" ||
    mime === "text/x-java" ||
    mime === "text/x-kotlin" ||
    mime === "text/x-python" ||
    mime === "text/x-ruby" ||
    mime === "text/x-rust" ||
    mime === "text/x-swift" ||
    mime === "text/x-typescript" ||
    mime === "text/yaml"
  ) {
    return "Code"
  }

  if (
    mime === "text/markdown" ||
    mime === "text/mdx" ||
    mime === "text/plain"
  ) {
    return "Text"
  }

  return "Archives & binary"
}

export const FILTER_TYPE_LABELS: Record<FileSystemFilterType, string> = {
  dateCreated: "Date created",
  dateModified: "Date modified",
  fileType: "File type",
}

export const FILTER_OPERATOR_LABELS: Record<FileSystemFilterOperator, string> = {
  after: "after",
  before: "before",
  "in-range": "in range",
  is: "is",
  "is-any-of": "is any of",
  "is-not": "is not",
  "not-in-range": "not in range",
}

export const DATE_FILTER_PRESETS = [
  "1 day ago",
  "3 days ago",
  "1 week ago",
  "1 month ago",
  "3 months ago",
  "6 months ago",
  "1 year ago",
]

export function dateFilterPresetCutoff(preset: string) {
  const date = new Date()

  switch (preset) {
    case "1 day ago":
      date.setDate(date.getDate() - 1)
      break
    case "3 days ago":
      date.setDate(date.getDate() - 3)
      break
    case "1 week ago":
      date.setDate(date.getDate() - 7)
      break
    case "1 month ago":
      date.setMonth(date.getMonth() - 1)
      break
    case "3 months ago":
      date.setMonth(date.getMonth() - 3)
      break
    case "6 months ago":
      date.setMonth(date.getMonth() - 6)
      break
    case "1 year ago":
      date.setFullYear(date.getFullYear() - 1)
      break
    default: {
      const parsed = Date.parse(preset)

      if (!Number.isNaN(parsed)) return new Date(parsed)
    }
  }
  return date
}

export function isCustomDateRangeValue(value: string[]) {
  return (
    value.length === 2 &&
    value.every(
      (entry) =>
        !DATE_FILTER_PRESETS.includes(entry) && !Number.isNaN(Date.parse(entry))
    )
  )
}

export function filterOperatorChoices(
  filter: FileSystemFilter
): FileSystemFilterOperator[] {
  if (filter.type === "fileType") {
    return filter.value.length > 1 ? ["is-any-of", "is-not"] : ["is", "is-not"]
  }
  if (isCustomDateRangeValue(filter.value)) return ["in-range", "not-in-range"]
  return ["before", "after"]
}

export function fileMatchesFilter(file: FileEntry, filter: FileSystemFilter) {
  if (filter.value.length === 0) return true
  if (filter.type === "fileType") {
    const matches = filter.value.includes(mimeTypeForFile(file))

    return filter.operator === "is-not" ? !matches : matches
  }

  const timestamp =
    filter.type === "dateCreated" ? file.createdAt : file.updatedAt
  const time = timestamp ? Date.parse(timestamp) : Number.NaN

  if (Number.isNaN(time)) return false
  if (filter.operator === "in-range" || filter.operator === "not-in-range") {
    const from = Date.parse(filter.value[0])
    const to = Date.parse(filter.value[1] ?? filter.value[0])
    const isInRange = time >= from && time <= to

    return filter.operator === "not-in-range" ? !isInRange : isInRange
  }

  const cutoff = dateFilterPresetCutoff(filter.value[0]).getTime()

  return filter.operator === "before" ? time <= cutoff : time >= cutoff
}

export function formatDateInputValue(date: Date | undefined) {
  if (!date) return ""

  const pad = (value: number) => String(value).padStart(2, "0")

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateInputValue(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return undefined

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)

  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    )

    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const parsed = Date.parse(trimmed)

  return Number.isNaN(parsed) ? undefined : new Date(parsed)
}

export const DATE_RANGE_DIALOG_PRESETS = [
  "Last 7 days",
  "This month",
  "Last 1 month",
  "Last 3 months",
  "This year",
  "Last 12 months",
]

export function dateRangePresetRange(preset: string) {
  const from = new Date()
  const to = new Date()

  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)

  switch (preset) {
    case "Last 7 days":
      from.setDate(from.getDate() - 6)
      break
    case "This month":
      from.setDate(1)
      break
    case "Last 1 month":
      from.setMonth(from.getMonth() - 1)
      break
    case "Last 3 months":
      from.setMonth(from.getMonth() - 3)
      break
    case "This year":
      from.setMonth(0, 1)
      break
    case "Last 12 months":
      from.setFullYear(from.getFullYear() - 1)
      break
  }
  return { from, to }
}

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

export function calendarDayKey(date: Date) {
  return date.getFullYear() * 10_000 + date.getMonth() * 100 + date.getDate()
}
