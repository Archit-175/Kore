/** Shared inline loading spinner. Inherits `currentColor`, sized via className
 *  (default 1em so it tracks the surrounding text). Decorative by default —
 *  pass a `label` when it's the only indication that something is loading. */
export function Spinner({
  className = 'h-[1em] w-[1em]',
  label,
}: {
  className?: string
  label?: string
}) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
