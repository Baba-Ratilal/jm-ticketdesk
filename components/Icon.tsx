const P: Record<string, string> = {
  tickets: "M4 7h16M4 12h16M4 17h10",
  plus: "M12 5v14M5 12h14",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16.5 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .6 3.5 2.2 3.5 5.2",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  auto: "M12 3a9 9 0 1 0 0 18V3z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  back: "M15 5l-7 7 7 7",
  chart: "M4 20V11M10 20V4M16 20v-6M22 20H2",
  check: "M4 12.5l5 5L20 6.5",
  issues: "M12 3l9.5 16.5h-19zM12 10v4.5M12 17.5h.01",
  mom: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  key: "M14.5 9.5a4 4 0 1 1-3.2 1.6L4 18v2h2.5v-2H9v-2.5h2.2",
};

export default function Icon({ name, size = 18 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] || ""} />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="32" height="32" rx="8" fill="#16262a" />
      <path
        d="M8 11h16v3.2a1.8 1.8 0 0 0 0 3.6V21H8v-3.2a1.8 1.8 0 0 0 0-3.6z"
        fill="none"
        stroke="#4fc1c8"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M17.5 12.5v7" stroke="#4fc1c8" strokeOpacity=".6" strokeWidth="1.6" strokeDasharray="1.6 2" />
    </svg>
  );
}
