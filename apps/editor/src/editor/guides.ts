import type { Rect } from './viewport';

/**
 * Smart guides: edge / center alignment plus spacing readout against the
 * parent box and its siblings, all resolved in the parent's local space.
 */
export interface GuideCandidate {
  axis: 'x' | 'y';
  position: number;
  /** Extent of the source rect along the other axis, used to draw the guide. */
  from: number;
  to: number;
  kind: 'edge' | 'center';
}

export interface GuideLine extends GuideCandidate {
  /** Coordinate the moving rect snapped to. */
  snapped: number;
}

export interface GuideResult {
  rect: Rect;
  lines: GuideLine[];
}

export function collectGuides(parent: Rect, siblings: Rect[], moving: Rect, includeParent = true): GuideCandidate[] {
  const candidates: GuideCandidate[] = [];

  const push = (rect: Rect, kind: 'edge' | 'center'): void => {
    candidates.push(
      { axis: 'x', position: rect.x, from: rect.y, to: rect.y + rect.height, kind },
      { axis: 'x', position: rect.x + rect.width, from: rect.y, to: rect.y + rect.height, kind },
      { axis: 'y', position: rect.y, from: rect.x, to: rect.x + rect.width, kind },
      { axis: 'y', position: rect.y + rect.height, from: rect.x, to: rect.x + rect.width, kind },
      { axis: 'x', position: rect.x + rect.width / 2, from: rect.y, to: rect.y + rect.height, kind: 'center' },
      { axis: 'y', position: rect.y + rect.height / 2, from: rect.x, to: rect.x + rect.width, kind: 'center' },
    );
  };

  for (const sibling of siblings) {
    if (sibling === moving || sameRect(sibling, moving)) {
      continue;
    }

    push(sibling, 'edge');
  }

  if (includeParent) {
    candidates.push(
      { axis: 'x', position: 0, from: 0, to: parent.height, kind: 'edge' },
      { axis: 'x', position: parent.width, from: 0, to: parent.height, kind: 'edge' },
      { axis: 'x', position: parent.width / 2, from: 0, to: parent.height, kind: 'center' },
      { axis: 'y', position: 0, from: 0, to: parent.width, kind: 'edge' },
      { axis: 'y', position: parent.height, from: 0, to: parent.width, kind: 'edge' },
      { axis: 'y', position: parent.height / 2, from: 0, to: parent.width, kind: 'center' },
    );
  }

  return candidates;
}

/** Snaps a moving rect to alignment candidates within `threshold` (parent units). */
export function snapRectToGuides(rect: Rect, candidates: GuideCandidate[], threshold: number): GuideResult {
  const lines: GuideLine[] = [];
  let bestX: { delta: number; candidate: GuideCandidate; edge: number } | null = null;
  let bestY: { delta: number; candidate: GuideCandidate; edge: number } | null = null;

  const xEdges = [
    { edge: rect.x, kind: 'edge' as const },
    { edge: rect.x + rect.width / 2, kind: 'center' as const },
    { edge: rect.x + rect.width, kind: 'edge' as const },
  ];
  const yEdges = [
    { edge: rect.y, kind: 'edge' as const },
    { edge: rect.y + rect.height / 2, kind: 'center' as const },
    { edge: rect.y + rect.height, kind: 'edge' as const },
  ];

  for (const candidate of candidates) {
    const edges = candidate.axis === 'x' ? xEdges : yEdges;

    for (const item of edges) {
      const delta = candidate.position - item.edge;

      if (Math.abs(delta) > threshold) {
        continue;
      }

      // Center-to-center only aligns with center candidates, edges with edges.
      if (item.kind === 'center' && candidate.kind !== 'center') {
        continue;
      }

      if (item.kind === 'edge' && candidate.kind === 'center') {
        continue;
      }

      if (candidate.axis === 'x') {
        if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
          bestX = { delta, candidate, edge: item.edge };
        }
      } else if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
        bestY = { delta, candidate, edge: item.edge };
      }
    }
  }

  const snapped: Rect = { ...rect };

  if (bestX) {
    snapped.x += bestX.delta;
    lines.push({ ...bestX.candidate, snapped: bestX.candidate.position });
  }

  if (bestY) {
    snapped.y += bestY.delta;
    lines.push({ ...bestY.candidate, snapped: bestY.candidate.position });
  }

  return { rect: snapped, lines };
}

export interface SpacingReadout {
  axis: 'x' | 'y';
  gap: number;
  from: number;
  to: number;
}

/** Nearest gap between the moving rect and its siblings on each axis. */
export function measureSpacing(rect: Rect, siblings: Rect[]): SpacingReadout[] {
  const readouts: SpacingReadout[] = [];
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  let nearestRight: SpacingReadout | null = null;
  let nearestLeft: SpacingReadout | null = null;
  let nearestBottom: SpacingReadout | null = null;
  let nearestTop: SpacingReadout | null = null;

  for (const sibling of siblings) {
    if (sameRect(sibling, rect)) {
      continue;
    }

    const siblingRight = sibling.x + sibling.width;
    const siblingBottom = sibling.y + sibling.height;
    const overlapsY = sibling.y < bottom && siblingBottom > rect.y;
    const overlapsX = sibling.x < right && siblingRight > rect.x;

    if (overlapsY) {
      if (sibling.x >= right) {
        const gap = sibling.x - right;
        const candidate: SpacingReadout = { axis: 'x', gap, from: right, to: sibling.x };
        if (!nearestRight || gap < nearestRight.gap) nearestRight = candidate;
      } else if (siblingRight <= rect.x) {
        const gap = rect.x - siblingRight;
        const candidate: SpacingReadout = { axis: 'x', gap, from: siblingRight, to: rect.x };
        if (!nearestLeft || gap < nearestLeft.gap) nearestLeft = candidate;
      }
    }

    if (overlapsX) {
      if (sibling.y >= bottom) {
        const gap = sibling.y - bottom;
        const candidate: SpacingReadout = { axis: 'y', gap, from: bottom, to: sibling.y };
        if (!nearestBottom || gap < nearestBottom.gap) nearestBottom = candidate;
      } else if (siblingBottom <= rect.y) {
        const gap = rect.y - siblingBottom;
        const candidate: SpacingReadout = { axis: 'y', gap, from: siblingBottom, to: rect.y };
        if (!nearestTop || gap < nearestTop.gap) nearestTop = candidate;
      }
    }
  }

  for (const candidate of [nearestRight, nearestLeft, nearestBottom, nearestTop]) {
    if (candidate) {
      readouts.push(candidate);
    }
  }

  return readouts;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
