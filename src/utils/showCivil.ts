export function showCivil(value: string): string {
  const [date, time] = value.split('T')
  const formatted = date?.split('-').reverse().join('/') ?? ''
  return time ? formatted + ' às ' + time.slice(0, 5) : formatted
}
