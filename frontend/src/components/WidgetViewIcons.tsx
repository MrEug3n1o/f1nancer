type IconProps = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function WidgetViewIcon({
  viewId,
  className,
}: {
  viewId: string;
  className?: string;
}) {
  const props: IconProps = { className };

  switch (viewId) {
    case "cards":
      return <IconCards {...props} />;
    case "bar":
    case "bar_chart":
    case "horizontal_bar":
      return <IconHorizontalBars {...props} />;
    case "bar_vertical":
      return <IconVerticalBars {...props} />;
    case "stacked":
      return <IconStackedBars {...props} />;
    case "area":
      return <IconArea {...props} />;
    case "line":
      return <IconLine {...props} />;
    case "pie":
      return <IconPie {...props} />;
    case "donut":
      return <IconDonut {...props} />;
    case "radial":
      return <IconRadial {...props} />;
    case "treemap":
      return <IconTreemap {...props} />;
    case "rings":
      return <IconRings {...props} />;
    case "bars":
      return <IconProgressBars {...props} />;
    case "table":
      return <IconTable {...props} />;
    case "list":
      return <IconList {...props} />;
    default:
      return <IconChart {...props} />;
  }
}

function IconCards({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2" y="3" width="6" height="5" rx="1" {...stroke} />
      <rect x="10" y="3" width="6" height="5" rx="1" {...stroke} />
      <rect x="2" y="10" width="14" height="5" rx="1" {...stroke} />
    </svg>
  );
}

function IconHorizontalBars({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <line x1="3" y1="5" x2="15" y2="5" {...stroke} />
      <line x1="3" y1="9" x2="11" y2="9" {...stroke} />
      <line x1="3" y1="13" x2="13" y2="13" {...stroke} />
    </svg>
  );
}

function IconVerticalBars({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <line x1="5" y1="14" x2="5" y2="8" {...stroke} />
      <line x1="9" y1="14" x2="9" y2="4" {...stroke} />
      <line x1="13" y1="14" x2="13" y2="10" {...stroke} />
    </svg>
  );
}

function IconStackedBars({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="4" y="8" width="3" height="6" rx="0.5" {...stroke} />
      <rect x="4" y="4" width="3" height="3" rx="0.5" {...stroke} />
      <rect x="8" y="6" width="3" height="8" rx="0.5" {...stroke} />
      <rect x="8" y="3" width="3" height="2" rx="0.5" {...stroke} />
      <rect x="12" y="10" width="3" height="4" rx="0.5" {...stroke} />
      <rect x="12" y="5" width="3" height="4" rx="0.5" {...stroke} />
    </svg>
  );
}

function IconArea({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M3 14 L7 9 L11 11 L15 5" {...stroke} />
      <path
        d="M3 14 L7 9 L11 11 L15 5 L15 14 Z"
        fill="currentColor"
        fillOpacity={0.15}
        stroke="none"
      />
    </svg>
  );
}

function IconLine({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M3 13 L7 8 L11 10 L15 4" {...stroke} />
      <circle cx="7" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPie({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6" {...stroke} />
      <path d="M9 9 L9 3 A6 6 0 0 1 14.2 11.5 Z" fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function IconDonut({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6" {...stroke} />
      <circle cx="9" cy="9" r="2.5" {...stroke} />
      <path d="M9 3 A6 6 0 0 1 14.2 11.5 L9 9 Z" fill="currentColor" fillOpacity={0.2} stroke="none" />
    </svg>
  );
}

function IconRadial({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M3 14 A8 8 0 0 1 15 14" {...stroke} />
      <path d="M5 14 A6 6 0 0 1 13 14" {...stroke} />
      <path d="M7 14 A4 4 0 0 1 11 14" fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function IconTreemap({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2" y="2" width="8" height="10" rx="1" {...stroke} />
      <rect x="11" y="2" width="5" height="5" rx="1" {...stroke} />
      <rect x="11" y="8" width="5" height="8" rx="1" {...stroke} />
      <rect x="2" y="13" width="8" height="3" rx="1" {...stroke} />
    </svg>
  );
}

function IconRings({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="5.5" {...stroke} />
      <circle cx="9" cy="9" r="3.5" {...stroke} />
      <path
        d="M9 3.5 A5.5 5.5 0 0 1 13.9 12.2"
        {...stroke}
        strokeWidth={2}
      />
    </svg>
  );
}

function IconProgressBars({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <line x1="2" y1="5" x2="16" y2="5" {...stroke} strokeOpacity={0.35} />
      <line x1="2" y1="5" x2="11" y2="5" {...stroke} strokeWidth={2.5} />
      <line x1="2" y1="9" x2="16" y2="9" {...stroke} strokeOpacity={0.35} />
      <line x1="2" y1="9" x2="8" y2="9" {...stroke} strokeWidth={2.5} />
      <line x1="2" y1="13" x2="16" y2="13" {...stroke} strokeOpacity={0.35} />
      <line x1="2" y1="13" x2="14" y2="13" {...stroke} strokeWidth={2.5} />
    </svg>
  );
}

function IconTable({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2" y="3" width="14" height="12" rx="1" {...stroke} />
      <line x1="2" y1="7" x2="16" y2="7" {...stroke} />
      <line x1="7" y1="7" x2="7" y2="15" {...stroke} />
    </svg>
  );
}

function IconList({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <line x1="3" y1="5" x2="15" y2="5" {...stroke} />
      <line x1="3" y1="9" x2="15" y2="9" {...stroke} />
      <line x1="3" y1="13" x2="15" y2="13" {...stroke} />
      <circle cx="5" cy="5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="5" cy="9" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="5" cy="13" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconChart({ className }: IconProps) {
  return <IconVerticalBars className={className} />;
}

export function IconMenuDots({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <circle cx="4" cy="9" r="1.2" fill="currentColor" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      <circle cx="14" cy="9" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function IconEyeOff({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M2 9s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z" {...stroke} />
      <circle cx="9" cy="9" r="2" {...stroke} />
      <line x1="3" y1="15" x2="15" y2="3" {...stroke} />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path d="M2 9s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z" {...stroke} />
      <circle cx="9" cy="9" r="2" {...stroke} />
    </svg>
  );
}

export function IconGrip({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <circle cx="7" cy="4.5" r="1.15" fill="currentColor" />
      <circle cx="11" cy="4.5" r="1.15" fill="currentColor" />
      <circle cx="7" cy="9" r="1.15" fill="currentColor" />
      <circle cx="11" cy="9" r="1.15" fill="currentColor" />
      <circle cx="7" cy="13.5" r="1.15" fill="currentColor" />
      <circle cx="11" cy="13.5" r="1.15" fill="currentColor" />
    </svg>
  );
}

export function IconFullWidth({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="5" width="13" height="8" rx="1.5" {...stroke} />
    </svg>
  );
}

export function IconHalfWidth({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <rect x="2.5" y="5" width="5.5" height="8" rx="1.5" {...stroke} />
      <rect x="10" y="5" width="5.5" height="8" rx="1.5" {...stroke} />
    </svg>
  );
}
