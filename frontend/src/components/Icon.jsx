const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  receipt: "M5 3h14v19l-3-2-4 2-4-2-3 2V3z M9 7h6 M9 11h6 M9 15h3",
  orders: "M5 7h14l2 13H3L5 7z M8 8V6a4 4 0 0 1 8 0v2",
  chef: "M7 15v5h10v-5 M7 16V12a4 4 0 1 1 1-7 4 4 0 0 1 8 0 4 4 0 1 1 1 7v4 M8 17h8",
  flame:
    "M12 3c1 6 6 7 6 12a6 6 0 1 1-12 0c0-3 2-5 4-7 0 3 1 4 2 4 2-2 1-6 0-9z",
  cup: "M5 3h14l-7 10L5 3z M12 13v8 M8 21h8 M7 6h10",
  book: "M12 5v16 M12 5C9 3 5 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 1z",
  chart: "M4 3v17h17 M8 15V9 M13 15V5 M18 15v-4",
  wallet: "M20 8V5H5a2 2 0 0 0 0 4h16v12H5a2 2 0 0 1-2-2V7 M21 13h-6v4h6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M6 18L18 6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  logout: "M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3",
  refresh: "M20 7a9 9 0 1 0 1 9 M20 2v6h-6",
  truck:
    "M3 5h11v12H3z M14 9h4l3 4v4h-7 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  print: "M7 8V3h10v5 M7 17H3V8h18v9h-4 M7 14h10v7H7z",
  check: "M5 12l4 4L19 6",
  leaf: "M5 19C-1 8 10 2 21 3c0 12-8 20-16 16z M5 19L16 8",
  monitor: "M3 4h18v13H3z M12 17v4 M8 21h8",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3z M10 21h4",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  pin: "M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0z M14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
};
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}
