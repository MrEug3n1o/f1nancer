type IconProps = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M3 8.2 9 3.5l6 4.7V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" {...stroke} />
      <path d="M7 16v-5h4v5" {...stroke} />
    </svg>
  );
}

export function IconList({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <line x1="6.5" y1="4.5" x2="15" y2="4.5" {...stroke} />
      <line x1="6.5" y1="9" x2="15" y2="9" {...stroke} />
      <line x1="6.5" y1="13.5" x2="15" y2="13.5" {...stroke} />
      <circle cx="3.75" cy="4.5" r="0.9" fill="currentColor" />
      <circle cx="3.75" cy="9" r="0.9" fill="currentColor" />
      <circle cx="3.75" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function IconWallet({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="4.5" width="13" height="10" rx="1.5" {...stroke} />
      <path d="M2.5 7h13" {...stroke} />
      <circle cx="12.5" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconTarget({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <line x1="4.5" y1="3.2" x2="4.5" y2="15" {...stroke} />
      <path d="M4.5 3.2h8.5l-2.4 3.2 2.4 3.2H4.5Z" {...stroke} />
    </svg>
  );
}

export function IconDeposit({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <polygon points="9,2.2 16,7.2 2,7.2" {...stroke} />
      <line x1="1.5" y1="7.2" x2="16.5" y2="7.2" {...stroke} />
      <line x1="4.5" y1="7.2" x2="4.5" y2="14.2" {...stroke} />
      <line x1="7.5" y1="9.2" x2="7.5" y2="14.2" {...stroke} />
      <line x1="10.5" y1="9.2" x2="10.5" y2="14.2" {...stroke} />
      <line x1="13.5" y1="7.2" x2="13.5" y2="14.2" {...stroke} />
      <line x1="2.2" y1="14.2" x2="15.8" y2="14.2" {...stroke} />
      <line x1="1.5" y1="16.2" x2="16.5" y2="16.2" {...stroke} />
    </svg>
  );
}

export function IconScale({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M4.5 3.5v11" {...stroke} />
      <polyline points="2.5 12.5 4.5 14.5 6.5 12.5" {...stroke} />
      <path d="M13.5 14.5V3.5" {...stroke} />
      <polyline points="11.5 5.5 13.5 3.5 15.5 5.5" {...stroke} />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M14 6.4A5.4 5.4 0 0 0 4.6 7.6" {...stroke} />
      <polyline points="14 3.4 14 6.4 11 6.4" {...stroke} />
      <path d="M4 11.6A5.4 5.4 0 0 0 13.4 10.4" {...stroke} />
      <polyline points="4 14.6 4 11.6 7 11.6" {...stroke} />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        {...stroke}
      />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <polyline points="11 4 6 9 11 14" {...stroke} />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <polyline points="7 4 12 9 7 14" {...stroke} />
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="4" width="13" height="12" rx="1.5" {...stroke} />
      <path d="M2.5 7.5h13" {...stroke} />
      <path d="M6 2.5v3M12 2.5v3" {...stroke} />
    </svg>
  );
}

export function IconPencil({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path
        d="M12.2 3.2a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L6.5 13.9 3.5 14.5l.6-3Z"
        {...stroke}
      />
      <path d="M11 4.4 13.6 7" {...stroke} />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M4 5.5h10" {...stroke} />
      <path
        d="M6.5 5.5V4.2A1.2 1.2 0 0 1 7.7 3h2.6a1.2 1.2 0 0 1 1.2 1.2v1.3"
        {...stroke}
      />
      <path
        d="M13.5 5.5V14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 14V5.5"
        {...stroke}
      />
      <path d="M7.5 8v5M10.5 8v5" {...stroke} />
    </svg>
  );
}
