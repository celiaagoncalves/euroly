// Brand mark — a stylized € glyph on a plum tile with amber stroke.
// Used in the sidebar and (via favicon.svg) the browser tab.
//
// `size` controls the square pixel dimensions; the inner glyph scales
// with the tile. Keep this file the single source of visual identity:
// any tweak to the logo should happen here AND in /public/favicon.svg.

export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Euroly"
    >
      <defs>
        <linearGradient id="euroly-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#683676" />
          <stop offset="1" stopColor="#48294f" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#euroly-logo-grad)" />
      <path
        d="M44 22.5c-2.6-3-6.5-4.8-10.7-4.8-7.6 0-13.7 6.1-13.7 13.7s6.1 13.7 13.7 13.7c4.2 0 8.1-1.9 10.7-4.8M16 28h22M16 36h22"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
