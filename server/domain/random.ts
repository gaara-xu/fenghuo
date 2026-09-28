import { createHash } from 'node:crypto'

export interface WeightedItem {
  weight: number
}

export class SeededRandom {
  private counter = 0

  constructor(private readonly seed: string) {}

  next(): number {
    const digest = createHash('sha256').update(`${this.seed}:${this.counter++}`).digest()
    return digest.readUInt32BE(0) / 0x1_0000_0000
  }

  pickWeighted<T extends WeightedItem>(items: readonly T[]): T {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
    if (total <= 0) throw new Error('Weighted pool has no positive entries')
    let cursor = this.next() * total
    for (const item of items) {
      cursor -= Math.max(0, item.weight)
      if (cursor < 0) return item
    }
    return items[items.length - 1]
  }
}

export function pickTalent(random: SeededRandom, weights?: Record<string, number> | null): string {
  const defaults = { MEDIOCRE: 15, COMMON: 40, GOOD: 28, EXCELLENT: 14, PERFECT: 3 }
  const source = weights && Object.keys(weights).length ? weights : defaults
  return random.pickWeighted(Object.entries(source).map(([key, weight]) => ({ key, weight }))).key
}
