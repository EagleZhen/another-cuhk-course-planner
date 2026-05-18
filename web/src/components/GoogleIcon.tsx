interface GoogleIconProps {
  className?: string
}

export function GoogleIcon({ className }: GoogleIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16.65 9.18c0-.57-.05-1.11-.15-1.63H9v3.08h4.29a3.68 3.68 0 0 1-1.59 2.42v2h2.58c1.51-1.39 2.37-3.43 2.37-5.87Z"
        fill="#4285F4"
      />
      <path
        d="M9 16.97c2.16 0 3.97-.72 5.28-1.93l-2.58-2c-.72.48-1.63.76-2.7.76-2.08 0-3.85-1.41-4.48-3.3H1.86v2.06A7.97 7.97 0 0 0 9 16.97Z"
        fill="#34A853"
      />
      <path
        d="M4.52 10.5A4.8 4.8 0 0 1 4.27 9c0-.52.09-1.02.25-1.5V5.44H1.86A7.97 7.97 0 0 0 1.01 9c0 1.28.31 2.49.85 3.56l2.66-2.06Z"
        fill="#FBBC05"
      />
      <path
        d="M9 4.2c1.17 0 2.23.4 3.06 1.2l2.29-2.29C12.96 1.82 11.16 1.03 9 1.03a7.97 7.97 0 0 0-7.14 4.41L4.52 7.5C5.15 5.61 6.92 4.2 9 4.2Z"
        fill="#EA4335"
      />
    </svg>
  )
}
