export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="var(--brand)" />
      <path d="M14 32h36a18 18 0 0 1-36 0Z" fill="#fff" />
      <rect x="22" y="49" width="20" height="4" rx="2" fill="#fff" opacity=".85" />
      <path
        d="M32 27.5c-.6-.5-6.5-4.4-6.5-8.3a3.6 3.6 0 0 1 6.5-2.2 3.6 3.6 0 0 1 6.5 2.2c0 3.9-5.9 7.8-6.5 8.3Z"
        fill="#fff"
      />
    </svg>
  );
}
