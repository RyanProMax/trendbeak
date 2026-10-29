import { line, curveMonotoneX } from "d3-shape";
import type { ChartPoint } from "./chart-series";

/** Intersects real observations and introduces no new extrema between them. */
export function chartPath(points: ChartPoint[], x: (date: string) => number, y: (value: number) => number) {
  return line<ChartPoint>().x((point) => x(point.date)).y((point) => y(point.value)).curve(curveMonotoneX)(points) ?? "";
}
