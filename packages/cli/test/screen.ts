/**
 * What a terminal shows after these writes: its lines from the first one written, the blank ones at the end left out.
 * It follows what the octopus's drawing writes (cursor up, carriage return, line feed, erase to the end of the line
 * and of the screen); colours and the cursor's visibility change no cell. A cursor sent above the first line written
 * is an error: the drawing went up further than it drew.
 */
export function screen(writes: readonly string[]): string[] {
  const rows: string[][] = [[]]
  let row = 0
  let col = 0
  for (const match of writes.join('').matchAll(/\x1b\[(\??[0-9;]*)([A-Za-z])|[^\x1b]/gu)) {
    const [text, parameter, command] = match
    if (command === undefined) {
      if (text === '\r') col = 0
      else if (text === '\n') { row++; col = 0; rows[row] ??= [] }
      else { while (rows[row]!.length < col) rows[row]!.push(' '); rows[row]![col++] = text }
    } else if (command === 'A') {
      row -= Number(parameter === '' ? 1 : parameter)
      if (row < 0) throw new Error(`the cursor went ${-row} rows above the first line written`)
    } else if (command === 'K') rows[row]!.length = Math.min(rows[row]!.length, col)
    else if (command === 'J') { rows[row]!.length = Math.min(rows[row]!.length, col); rows.length = row + 1 }
  }
  const lines = rows.map((cells) => cells.join('').trimEnd())
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
  return lines
}
