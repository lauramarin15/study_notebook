const paths = {
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z" /><path d="M8 3v14m3-9h5m-5 4h3" /></>,
  library: <><rect x="3" y="4" width="4" height="16" rx="1" /><path d="M11 4v16m4-15 4-1 3 15-4 1-3-15Z" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8m-8 4h5" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  sparkles: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
  practice: <><path d="m15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-5L4 14l-1 7 1-1Z" /><path d="m4 14 5 5m5 2h7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M20 12H4m6-6-6 6 6 6" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
};

export default function Icon({ name, className = "" }) {
  return (
    <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
