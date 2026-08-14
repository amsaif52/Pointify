import type { ScaleId } from "./types";

export type Scale = {
  id: ScaleId;
  name: string;
  description: string;
  cards: string[];
};

export const SCALES: Scale[] = [
  {
    id: "fibonacci",
    name: "Fibonacci",
    description: "Classic Fibonacci sequence",
    cards: ["1", "2", "3", "5", "8", "13", "21", "?"],
  },
  {
    id: "modified",
    name: "Modified Fibonacci",
    description: "Fibonacci with additional large values",
    cards: ["0", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?"],
  },
  {
    id: "tshirt",
    name: "T-Shirt Sizes",
    description: "Relative sizing using t-shirt sizes",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?"],
  },
  {
    id: "powers",
    name: "Powers of 2",
    description: "Exponential scale based on powers of 2",
    cards: ["1", "2", "4", "8", "16", "32", "64", "?"],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Simple linear scale from 1 to 10",
    cards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?"],
  },
];

export const DEFAULT_SCALE: ScaleId = "fibonacci";

export function getScale(id: ScaleId): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

export function isScaleId(v: unknown): v is ScaleId {
  return typeof v === "string" && SCALES.some((s) => s.id === v);
}
