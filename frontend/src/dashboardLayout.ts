import type { DashboardWidgetId, DashboardWidgetLayoutItem } from "./types";

export type GridRow = {
  index: number;
  full: DashboardWidgetLayoutItem | null;
  left: DashboardWidgetLayoutItem | null;
  right: DashboardWidgetLayoutItem | null;
};

function emptyRow(index: number): GridRow {
  return { index, full: null, left: null, right: null };
}

function isEmptyRow(row: GridRow): boolean {
  return !row.full && !row.left && !row.right;
}

export function packRows(items: DashboardWidgetLayoutItem[]): GridRow[] {
  const rows: GridRow[] = [];
  let current: GridRow | null = null;

  function flush() {
    if (current) {
      rows.push(current);
      current = null;
    }
  }

  for (const raw of items) {
    const col: 0 | 1 = raw.span === 2 || raw.col !== 1 ? 0 : 1;
    const item: DashboardWidgetLayoutItem = { ...raw, col };
    if (item.span === 2) {
      flush();
      rows.push({ ...emptyRow(rows.length), full: item });
      continue;
    }
    if (!current || current.full) {
      flush();
      current = emptyRow(rows.length);
    }
    if (col === 0) {
      if (current.left) {
        flush();
        current = { ...emptyRow(rows.length), left: item };
      } else {
        current.left = item;
      }
    } else if (current.right) {
      flush();
      current = { ...emptyRow(rows.length), right: item };
    } else {
      current.right = item;
    }
  }
  flush();
  return rows.map((row, index) => ({ ...row, index }));
}

export function flattenRows(rows: GridRow[]): DashboardWidgetLayoutItem[] {
  const result: DashboardWidgetLayoutItem[] = [];
  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    if (row.full) {
      result.push({ ...row.full, span: 2, col: 0 });
      continue;
    }
    if (row.left) result.push({ ...row.left, span: 1, col: 0 });
    if (row.right) result.push({ ...row.right, span: 1, col: 1 });
  }
  return result;
}

function removeWidget(rows: GridRow[], widgetId: string): GridRow[] {
  return rows.map((row, index) => ({
    index,
    full: row.full?.id === widgetId ? null : row.full,
    left: row.left?.id === widgetId ? null : row.left,
    right: row.right?.id === widgetId ? null : row.right,
  }));
}

function occupantRow(item: DashboardWidgetLayoutItem): GridRow {
  if (item.span === 2) {
    return { ...emptyRow(0), full: { ...item, span: 2, col: 0 } };
  }
  if (item.col === 1) {
    return { ...emptyRow(0), right: { ...item, span: 1, col: 1 } };
  }
  return { ...emptyRow(0), left: { ...item, span: 1, col: 0 } };
}

export type DropTarget = {
  rowIndex: number;
  span: 1 | 2;
  col: 0 | 1;
};

export function placeInSlot(
  items: DashboardWidgetLayoutItem[],
  widgetId: DashboardWidgetId,
  target: DropTarget,
): DashboardWidgetLayoutItem[] {
  const widget = items.find((item) => item.id === widgetId);
  if (!widget) return items;
  const rows = removeWidget(packRows(items), widgetId);
  while (rows.length <= target.rowIndex) {
    rows.push(emptyRow(rows.length));
  }
  const row = rows[target.rowIndex];
  if (target.span === 2) {
    const displaced: GridRow = {
      index: 0,
      full: row.full,
      left: row.left,
      right: row.right,
    };
    row.full = { ...widget, span: 2, col: 0 };
    row.left = null;
    row.right = null;
    if (!isEmptyRow(displaced)) {
      rows.splice(target.rowIndex + 1, 0, displaced);
    }
    return flattenRows(rows);
  }
  const placed: DashboardWidgetLayoutItem = {
    ...widget,
    span: 1,
    col: target.col,
  };
  if (row.full) {
    const displaced: DashboardWidgetLayoutItem = {
      ...row.full,
      span: 1,
      col: target.col === 1 ? 0 : 1,
    };
    row.full = null;
    row.left = target.col === 1 ? displaced : placed;
    row.right = target.col === 1 ? placed : displaced;
  } else {
    const occupant = target.col === 0 ? row.left : row.right;
    if (target.col === 0) row.left = placed;
    else row.right = placed;
    if (occupant) {
      rows.splice(target.rowIndex + 1, 0, occupantRow(occupant));
    }
  }
  return flattenRows(rows);
}

export function moveBefore(
  items: DashboardWidgetLayoutItem[],
  draggedId: string,
  targetId: string,
): DashboardWidgetLayoutItem[] {
  if (draggedId === targetId) return items;
  const dragged = items.find((item) => item.id === draggedId);
  if (!dragged) return items;
  const without = items.filter((item) => item.id !== draggedId);
  const index = without.findIndex((item) => item.id === targetId);
  if (index < 0) return items;
  return [...without.slice(0, index), dragged, ...without.slice(index)];
}

export function setWidgetSpan(
  items: DashboardWidgetLayoutItem[],
  widgetId: DashboardWidgetId,
  span: 1 | 2,
): DashboardWidgetLayoutItem[] {
  return items.map((item) => {
    if (item.id !== widgetId) return item;
    if (span === 2) return { ...item, span: 2, col: 0 };
    return { ...item, span: 1, col: item.col === 1 ? 1 : 0 };
  });
}

export function slotId(rowIndex: number, col: 0 | 1 | "full"): string {
  return `slot:${rowIndex}:${col}`;
}

export function widgetDropId(widgetId: string): string {
  return `drop:${widgetId}`;
}

export function parseSlotId(id: string): DropTarget | null {
  const match = /^slot:(\d+):(0|1|full)$/.exec(id);
  if (!match) return null;
  const rowIndex = Number(match[1]);
  if (match[2] === "full") return { rowIndex, span: 2, col: 0 };
  return { rowIndex, span: 1, col: match[2] === "1" ? 1 : 0 };
}

export function parseWidgetDropId(id: string): string | null {
  return id.startsWith("drop:") ? id.slice(5) : null;
}
