// Fixed English daily-card markup and geometry adapted from
// DenverCoder1/github-readme-streak-stats (MIT). See streak-upstream-LICENSE.md.
const font = '&quot;Segoe UI&quot;, Ubuntu, sans-serif'
const text = (x, y, color, weight, size, animation, value, baseline = 32) => `    <g transform='translate(${x}, ${y})'>
      <text x='0' y='${baseline}' stroke-width='0' text-anchor='middle' fill='${color}' stroke='none' font-family='${font}' font-weight='${weight}' font-size='${size}px' font-style='normal' style='${animation}'>
        ${value}
      </text>
    </g>`
const fade = (delay) => `opacity: 0; animation: fadein 0.5s linear forwards ${delay}s`
const divider = (x) => `    <line x1='${x}' y1='24.25' x2='${x}' y2='162.5' vector-effect='non-scaling-stroke' stroke-width='1' stroke='#30363D' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>`
const flame = 'M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z'

const layout = `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' style='isolation: isolate' viewBox='0 0 495 180' width='495px' height='180px' direction='ltr'>
  <style>
    @keyframes currstreak {
      0% { font-size: 3px; opacity: 0.2; }
      80% { font-size: 34px; opacity: 1; }
      100% { font-size: 28px; opacity: 1; }
    }
    @keyframes fadein {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
  </style>
  <defs>
    <clipPath id='outer_rectangle'><rect width='495' height='180' rx='10'/></clipPath>
    <mask id='mask_out_ring_behind_fire'>
      <rect width='495' height='180' fill='white'/>
      <ellipse id='mask-ellipse' cx='247.5' cy='32' rx='13' ry='18' fill='black'/>
    </mask>
  </defs>
  <g clip-path='url(#outer_rectangle)'>
    <rect stroke='#30363D' fill='#161B22' rx='10' x='0.5' y='0.5' width='494' height='179'/>
${divider(165)}
${divider(330)}
${text(82.5, 40.5, '#E6EDF3', 700, 28, fade(0.6), '{{total}}')}
${text(82.5, 76.5, '#E6EDF3', 400, 14, fade(0.7), 'Total Contributions')}
${text(82.5, 106.5, '#9DA7B3', 400, 12, fade(0.8), '{{first}}')}
${text(247.5, 100.5, '#AD91FF', 700, 14, fade(0.9), 'Current Streak')}
${text(247.5, 137.5, '#9DA7B3', 400, 12, fade(0.9), '{{currentRange}}', 21)}
    <g mask='url(#mask_out_ring_behind_fire)'>
      <circle cx='247.5' cy='63.5' r='40' fill='none' stroke='#AD91FF' stroke-width='5' style='${fade(0.4)}'/>
    </g>
    <g transform='translate(247.5, 12)' stroke-opacity='0' style='${fade(0.6)}'>
      <path d='M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z' fill='none'/>
      <path d='${flame}' fill='#AD91FF' stroke-opacity='0'/>
    </g>
${text(247.5, 40.5, '#E6EDF3', 700, 28, 'animation: currstreak 0.6s linear forwards', '{{current}}')}
${text(412.5, 40.5, '#E6EDF3', 700, 28, fade(1.2), '{{longest}}')}
${text(412.5, 76.5, '#E6EDF3', 400, 14, fade(1.3), 'Longest Streak')}
${text(412.5, 106.5, '#9DA7B3', 400, 12, fade(1.4), '{{longestRange}}')}
  </g>
</svg>
`

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const number = new Intl.NumberFormat('en-US')
const slot = /\{\{([a-zA-Z]+)\}\}/g
const fitRange = (first, last) => first === last ? first :
  first.length + last.length + 3 <= 27 ? `${first} - ${last}` :
    `<tspan x='0' dy='0'>${first}</tspan><tspan x='0' dy='16'>- ${last}</tspan>`

function formatDay(date, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid streak date.')
  const [year, month, day] = date.split('-').map(Number)
  return `${months[month - 1]} ${day}${year === Number(today.slice(0, 4)) ? '' : `, ${year}`}`
}

export function renderStreak(stats, today) {
  const day = (date) => formatDay(date, today)
  const values = {
    total: number.format(stats.total),
    first: fitRange(day(stats.first), 'Present'),
    current: number.format(stats.current.length),
    currentRange: fitRange(day(stats.current.start), day(stats.current.end)),
    longest: number.format(stats.longest.length),
    longestRange: fitRange(day(stats.longest.start), day(stats.longest.end)),
  }
  return layout.replace(slot, (_token, key) => values[key])
}

// Match the entire canonical SVG, allowing only the six visible aggregate
// fields to vary. Each capture is checked against a closed display grammar.
const pieces = layout.split(slot)
const shape = new RegExp(`^${pieces.map((part, index) => index % 2
  ? `(?<${part}>[^\\r\\n]{1,150})` : RegExp.escape(part)).join('')}$`)
const displayDate = new RegExp(`^(${months.join('|')}) ([1-9]|[12][0-9]|3[01])(?:, (20[0-9]{2}|2[1-9][0-9]{2}))?$`)

function isDisplayDay(value) {
  const match = displayDate.exec(value)
  if (!match) return false
  const [, month, day, year = '2000'] = match
  return new Date(Date.UTC(Number(year), months.indexOf(month), Number(day))).getUTCDate() === Number(day)
}

function isRange(value, firstContribution = false) {
  const wrapped = /^<tspan x='0' dy='0'>([^<>]+)<\/tspan><tspan x='0' dy='16'>- ([^<>]+)<\/tspan>$/.exec(value)
  const [first, last, extra] = wrapped ? wrapped.slice(1) : value.split(' - ')
  return extra === undefined && isDisplayDay(first)
    && (firstContribution ? last === 'Present' : last === undefined || isDisplayDay(last))
    && fitRange(first, last ?? first) === value
}

function parseNumber(value) {
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isSafeInteger(parsed) && parsed >= 0 && number.format(parsed) === value ? parsed : NaN
}

export function validateStreakSvg(svg) {
  const values = typeof svg === 'string' && Buffer.byteLength(svg) <= 16_384 && shape.exec(svg)?.groups
  if (values) {
    const total = parseNumber(values.total)
    const current = parseNumber(values.current)
    const longest = parseNumber(values.longest)
    if (total >= longest && longest >= current && (total === 0) === (longest === 0)
        && isRange(values.first, true) && isRange(values.currentRange) && isRange(values.longestRange)) return
  }
  throw new Error('Invalid streak SVG.')
}
