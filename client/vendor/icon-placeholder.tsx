import type { SVGProps } from 'react';
import {
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
} from 'lucide-react';

// Vendored extend-ui components reference icons through <IconPlaceholder /> with
// one name per supported icon library. We only render the lucide variant and
// keep a lookup table of the icons our components use.
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
};

export type IconPlaceholderProps = {
  lucide: string;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
} & SVGProps<SVGSVGElement>;

export function IconPlaceholder(props: IconPlaceholderProps) {
  const { lucide, tabler: _t, hugeicons: _h, phosphor: _p, remixicon: _r, ...rest } = props;
  const Icon = icons[lucide] ?? CircleMinus;
  return <Icon {...rest} />;
}
