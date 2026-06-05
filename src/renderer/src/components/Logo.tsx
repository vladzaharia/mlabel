/** The MLabel mark: a checklist (two done rows + one in progress). Mirrors build/icon.svg. */
export function Logo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="mlabel-bg"
          x1="32"
          y1="24"
          x2="224"
          y2="232"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2E63FF" />
          <stop offset="1" stopColor="#6A45FF" />
        </linearGradient>
        <linearGradient
          id="mlabel-check"
          x1="58"
          y1="72"
          x2="90"
          y2="184"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#22D37D" />
          <stop offset="1" stopColor="#10B765" />
        </linearGradient>
      </defs>

      <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#mlabel-bg)" />

      {/* row 1 (done) */}
      <rect x="58" y="72" width="32" height="32" rx="10" fill="url(#mlabel-check)" />
      <path
        d="M67 88 L73 95 L84 80"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="104" y="80" width="94" height="16" rx="8" fill="#ffffff" opacity="0.95" />

      {/* row 2 (done) */}
      <rect x="58" y="112" width="32" height="32" rx="10" fill="url(#mlabel-check)" />
      <path
        d="M67 128 L73 135 L84 120"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="104" y="120" width="78" height="16" rx="8" fill="#ffffff" opacity="0.95" />

      {/* row 3 (in progress) */}
      <rect
        x="59.5"
        y="153.5"
        width="29"
        height="29"
        rx="9"
        fill="#ffffff"
        fillOpacity="0.12"
        stroke="#ffffff"
        strokeOpacity="0.7"
        strokeWidth="3"
      />
      <rect x="104" y="160" width="66" height="16" rx="8" fill="#ffffff" opacity="0.4" />
    </svg>
  );
}
