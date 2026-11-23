export function suggestOpeningDate(startsAt: string): string {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T/.exec(startsAt)
  if (!match) return ''
  const targetYear = Number(match[1]) + 1
  if (targetYear > 9999) return ''
  const leap = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0)
  const day = match[2] === '02' && match[3] === '29' && !leap ? '28' : match[3]
  return [String(targetYear).padStart(4, '0'), match[2], day].join('-')
}

export function withCivilSeconds(value: string): string {
  return value.length === 16 ? value + ':00' : value
}
