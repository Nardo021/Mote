export function MoteMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 26c0-6 3-12 10-16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M26 26c0-6-3-12-10-16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle
        cx="16"
        cy="10"
        r="3"
        stroke="var(--primary)"
        strokeWidth="2.4"
      />
      <circle cx="6" cy="26" r="2.2" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="26" cy="26" r="2.2" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}
