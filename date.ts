const monthsNO = new Map([
  ["januar", 0],
  ["februar", 1],
  ["mars", 2],
  ["april", 3],
  ["mai", 4],
  ["juni", 5],
  ["juli", 6],
  ["august", 7],
  ["september", 8],
  ["oktober", 9],
  ["november", 10],
  ["desember", 11],
]);

export function parseDate(str: string): Date {
  const match = str.match(/(\d{1,2})\.\s*([a-zæøå]+)/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthName = match[2].toLowerCase();
    const month = monthsNO.get(monthName);
    if (month !== undefined) {
      return new Date(new Date().getFullYear(), month, day);
    }
  }

  throw new Error(`Invalid date format: ${str}`);
}
