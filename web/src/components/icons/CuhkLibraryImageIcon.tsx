interface CuhkLibraryImageIconProps {
  className?: string
}

export function CuhkLibraryImageIcon({ className }: CuhkLibraryImageIconProps) {
  return (
    <img
      className={className}
      src="/icons/cuhk-library-small.png"
      alt=""
      aria-hidden="true"
    />
  )
}
