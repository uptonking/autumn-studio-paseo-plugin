import type { SVGProps } from "react"
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.js"
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js"
import ArrowUpDown from "lucide-react/dist/esm/icons/arrow-up-down.js"
import Calendar from "lucide-react/dist/esm/icons/calendar.js"
import Check from "lucide-react/dist/esm/icons/check.js"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js"
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up.js"
import CircleMinus from "lucide-react/dist/esm/icons/circle-minus.js"
import CirclePlusIcon from "lucide-react/dist/esm/icons/circle-plus.js"
import Columns3 from "lucide-react/dist/esm/icons/columns-3.js"
import Download from "lucide-react/dist/esm/icons/download.js"
import Ellipsis from "lucide-react/dist/esm/icons/ellipsis.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import FileArchiveIcon from "lucide-react/dist/esm/icons/file-archive.js"
import Filter from "lucide-react/dist/esm/icons/filter.js"
import GalleryThumbnails from "lucide-react/dist/esm/icons/gallery-thumbnails.js"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js"
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2.js"
import PanelLeft from "lucide-react/dist/esm/icons/panel-left.js"
import PanelTop from "lucide-react/dist/esm/icons/panel-top.js"
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Upload from "lucide-react/dist/esm/icons/upload.js"
import X from "lucide-react/dist/esm/icons/x.js"

// Vendored extend-ui components reference icons through <IconPlaceholder /> with
// one name per supported icon library. We import individual icon modules directly
// instead of the monolithic "lucide-react" barrel to keep Paseo plugin boundary
// checks fast (< 1s vs 58s).
const icons: Record<string, React.ComponentType<SVGProps<SVGSVGElement>>> = {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleMinus,
  CirclePlusIcon,
  Columns3,
  Columns3Icon: Columns3,
  Download,
  Ellipsis,
  ExternalLink,
  FileArchiveIcon,
  Filter,
  GalleryThumbnails,
  LayoutGrid,
  Loader2,
  Maximize2,
  PanelLeft,
  PanelTop,
  RotateCw,
  Search,
  Settings,
  Upload,
  X,
}

export type IconPlaceholderProps = {
  lucide: string
  tabler?: string
  hugeicons?: string
  phosphor?: string
  remixicon?: string
} & SVGProps<SVGSVGElement>

export function IconPlaceholder(props: IconPlaceholderProps) {
  const { lucide, tabler: _t, hugeicons: _h, phosphor: _p, remixicon: _r, ...rest } = props
  const Icon = icons[lucide] ?? CircleMinus
  return <Icon {...rest} />
}
