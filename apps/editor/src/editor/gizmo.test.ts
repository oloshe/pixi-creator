import { describe, expect, it } from 'vitest';
import {
  axisScaleRatio,
  axisVectors,
  pointToSegmentDistance,
  projectOntoAxis,
  ringHit,
  uniformScaleRatio,
} from './gizmo';

describe('axisVectors', () => {
  it('returns world-aligned axes at 0°', () => {
    const axes = axisVectors(0);
    expect(axes.x.x).toBeCloseTo(1);
    expect(axes.x.y).toBeCloseTo(0);
    expect(axes.y.x).toBeCloseTo(0);
    expect(axes.y.y).toBeCloseTo(1);
  });

  it('rotates axes at 90°', () => {
    const axes = axisVectors(90);
    expect(axes.x.x).toBeCloseTo(0);
    expect(axes.x.y).toBeCloseTo(1);
    expect(axes.y.x).toBeCloseTo(-1);
    expect(axes.y.y).toBeCloseTo(0);
  });
});

describe('projectOntoAxis', () => {
  it('projects a delta onto a unit axis', () => {
    expect(projectOntoAxis({ x: 10, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(10);
    expect(projectOntoAxis({ x: 10, y: 3 }, { x: 0, y: 1 })).toBeCloseTo(3);
  });
});

describe('pointToSegmentDistance', () => {
  it('measures distance to a horizontal segment', () => {
    expect(pointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });

  it('clamps beyond the segment end', () => {
    expect(pointToSegmentDistance({ x: 12, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(2);
  });
});

describe('ringHit', () => {
  it('hits the annulus', () => {
    expect(ringHit({ x: 60, y: 0 }, { x: 0, y: 0 }, 60)).toBe(true);
    expect(ringHit({ x: 0, y: 0 }, { x: 0, y: 0 }, 60)).toBe(false);
    expect(ringHit({ x: 200, y: 0 }, { x: 0, y: 0 }, 60)).toBe(false);
  });
});

describe('scale ratios', () => {
  it('computes a uniform scale ratio from distances', () => {
    const ratio = uniformScaleRatio({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 });
    expect(ratio).toBeCloseTo(2);
  });

  it('computes an axis scale ratio from projections', () => {
    const axis = { x: 1, y: 0 };
    const ratio = axisScaleRatio({ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 30, y: 5 }, axis);
    expect(ratio).toBeCloseTo(3);
  });

  it('returns 1 when the start projection is zero', () => {
    const axis = { x: 0, y: 1 };
    const ratio = axisScaleRatio({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, axis);
    expect(ratio).toBeCloseTo(1);
  });
});
