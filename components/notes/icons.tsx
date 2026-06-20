// Minimal inline-SVG icon set for the Notes UI (no icon dependency). 16px,
// currentColor stroke — inherits text color + dark mode for free.

type IconProps = { className?: string }

function svg(path: React.ReactNode, filled = false) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className ?? 'h-4 w-4'}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    )
  }
}

export const PinIcon = svg(
  <>
    <path d="M9 4h6l-1 7 3 3v2H7v-2l3-3-1-7Z" />
    <path d="M12 16v5" />
  </>,
)
export const PinFilledIcon = svg(
  <>
    <path d="M9 4h6l-1 7 3 3v2H7v-2l3-3-1-7Z" />
    <path d="M12 16v5" />
  </>,
  true,
)
export const ArchiveIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </>,
)
export const UnarchiveIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M12 18v-6m0 0-2 2m2-2 2 2" />
  </>,
)
export const TrashIcon = svg(
  <>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M9 7V4h6v3" />
  </>,
)
export const RestoreIcon = svg(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
  </>,
)
export const LabelIcon = svg(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h8l8 7-8 7H5a2 2 0 0 1-2-2V7Z" />
    <circle cx="8" cy="12" r="1" />
  </>,
)
export const PaletteIcon = svg(
  <>
    <path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1-1.5-.5-.8-.2-2 1-2H17a4 4 0 0 0 4-4 8 8 0 0 0-9-7.5Z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="12" cy="8" r="1" />
    <circle cx="16" cy="11" r="1" />
  </>,
)
export const ImageIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9" r="1.5" />
    <path d="M21 16l-5-5L5 20" />
  </>,
)
export const CheckSquareIcon = svg(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 12l3 3 5-6" />
  </>,
)
export const MoreIcon = svg(
  <>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </>,
)
export const CloseIcon = svg(<path d="M6 6l12 12M18 6 6 18" />)
export const PlusIcon = svg(<path d="M12 5v14M5 12h14" />)
export const GridIcon = svg(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
)
export const ListIcon = svg(
  <>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </>,
)
export const SearchIcon = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
)
export const CheckIcon = svg(<path d="M5 12l5 5L20 7" />)
