export interface ClockRow {
  real_anchor_at: Date
  game_anchor_at: Date
  multiplier: number
}

export function gameNow(row: ClockRow, realNow = new Date()): Date {
  const elapsed = realNow.getTime() - new Date(row.real_anchor_at).getTime()
  return new Date(new Date(row.game_anchor_at).getTime() + elapsed * Number(row.multiplier))
}

export function reanchorClock(row: ClockRow, multiplier: number, realNow = new Date()): ClockRow {
  return { real_anchor_at: realNow, game_anchor_at: gameNow(row, realNow), multiplier }
}
