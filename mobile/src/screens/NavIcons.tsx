// Mobile copy of frontend/src/components/NavIcons.tsx — keep the drawings identical.
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

export type IconProps = { color: string; size?: number };

const stroke = (color: string) => ({
  fill: "none",
  stroke: color,
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconHome({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M3 8.2 9 3.5l6 4.7V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" {...s} />
      <Path d="M7 16v-5h4v5" {...s} />
    </Svg>
  );
}

export function IconList({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Line x1="6.5" y1="4.5" x2="15" y2="4.5" {...s} />
      <Line x1="6.5" y1="9" x2="15" y2="9" {...s} />
      <Line x1="6.5" y1="13.5" x2="15" y2="13.5" {...s} />
      <Circle cx="3.75" cy="4.5" r="0.9" fill={color} />
      <Circle cx="3.75" cy="9" r="0.9" fill={color} />
      <Circle cx="3.75" cy="13.5" r="0.9" fill={color} />
    </Svg>
  );
}

export function IconWallet({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Rect x="2.5" y="4.5" width="13" height="10" rx="1.5" {...s} />
      <Path d="M2.5 7h13" {...s} />
      <Circle cx="12.5" cy="11" r="1" fill={color} />
    </Svg>
  );
}

export function IconTarget({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Line x1="4.5" y1="3.2" x2="4.5" y2="15" {...s} />
      <Path d="M4.5 3.2h8.5l-2.4 3.2 2.4 3.2H4.5Z" {...s} />
    </Svg>
  );
}

export function IconDeposit({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Polygon points="9,2.2 16,7.2 2,7.2" {...s} />
      <Line x1="1.5" y1="7.2" x2="16.5" y2="7.2" {...s} />
      <Line x1="4.5" y1="7.2" x2="4.5" y2="14.2" {...s} />
      <Line x1="7.5" y1="9.2" x2="7.5" y2="14.2" {...s} />
      <Line x1="10.5" y1="9.2" x2="10.5" y2="14.2" {...s} />
      <Line x1="13.5" y1="7.2" x2="13.5" y2="14.2" {...s} />
      <Line x1="2.2" y1="14.2" x2="15.8" y2="14.2" {...s} />
      <Line x1="1.5" y1="16.2" x2="16.5" y2="16.2" {...s} />
    </Svg>
  );
}

export function IconScale({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M4.5 3.5v11" {...s} />
      <Polyline points="2.5 12.5 4.5 14.5 6.5 12.5" {...s} />
      <Path d="M13.5 14.5V3.5" {...s} />
      <Polyline points="11.5 5.5 13.5 3.5 15.5 5.5" {...s} />
    </Svg>
  );
}

export function IconRefresh({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M14 6.4A5.4 5.4 0 0 0 4.6 7.6" {...s} />
      <Polyline points="14 3.4 14 6.4 11 6.4" {...s} />
      <Path d="M4 11.6A5.4 5.4 0 0 0 13.4 10.4" {...s} />
      <Polyline points="4 14.6 4 11.6 7 11.6" {...s} />
    </Svg>
  );
}

export function IconGear({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="3" {...s} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        {...s}
      />
    </Svg>
  );
}

export function IconChevronLeft({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Polyline points="11 4 6 9 11 14" {...stroke(color)} />
    </Svg>
  );
}

export function IconChevronRight({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Polyline points="7 4 12 9 7 14" {...stroke(color)} />
    </Svg>
  );
}

export function IconTrash({ color, size = 18 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M4 5.5h10" {...s} />
      <Path d="M6.5 5.5V4.2A1.2 1.2 0 0 1 7.7 3h2.6a1.2 1.2 0 0 1 1.2 1.2v1.3" {...s} />
      <Path d="M13.5 5.5V14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 14V5.5" {...s} />
      <Path d="M7.5 8v5M10.5 8v5" {...s} />
    </Svg>
  );
}

// Mobile-only: the desktop sidebar has no "More" entry.
export function IconMore({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Circle cx="3.5" cy="9" r="1.4" fill={color} />
      <Circle cx="9" cy="9" r="1.4" fill={color} />
      <Circle cx="14.5" cy="9" r="1.4" fill={color} />
    </Svg>
  );
}
