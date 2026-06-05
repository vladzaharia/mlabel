/** The MLabel mark: a label/tag with a "labeled" check. Mirrors build/icon.svg. */
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
          x1="142"
          y1="138"
          x2="206"
          y2="202"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#22D37D" />
          <stop offset="1" stopColor="#10B765" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#mlabel-bg)" />
      <g transform="translate(54 78) rotate(-20 65 39)">
        <path
          d="M0 39 L30 2 Q34 -2 40 -2 L112 -2 Q130 -2 130 16 L130 62 Q130 80 112 80 L40 80 Q34 80 30 76 Z"
          fill="#ffffff"
        />
        <circle cx="32" cy="39" r="9" fill="#3F5AE8" />
      </g>
      <circle cx="174" cy="170" r="34" fill="url(#mlabel-check)" stroke="#ffffff" strokeWidth="6" />
      <path
        d="M160 171 L170 182 L189 159"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
