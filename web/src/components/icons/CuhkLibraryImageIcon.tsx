import Image from 'next/image'

interface CuhkLibraryImageIconProps {
  className?: string
}

export function CuhkLibraryImageIcon({ className }: CuhkLibraryImageIconProps) {
  return (
    <Image
      className={className}
      src="/icons/cuhk-library-small.png"
      width={30}
      height={30}
      alt=""
      aria-hidden="true"
      unoptimized
    />
  )
}
