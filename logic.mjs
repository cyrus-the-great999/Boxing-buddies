// Pure helpers shared by the app and the unit tests. No network, no DOM.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const TIMES = ['Morning', 'Afternoon', 'Evening']
export const INT = ['Technical', 'Light', 'Moderate', 'Hard']
export const GOALS = ['Learn basics', 'Technical work', 'Fitness', 'Fight prep']
export const W = ['All', 'Featherweight', 'Lightweight', 'Welterweight', 'Middleweight', 'Heavyweight']
export const E = ['All', 'Beginner', 'Intermediate', 'Advanced']
export const CONFIRMATIONS_REQUIRED = 3
export const BIO_MAX = 500
export const MESSAGE_MAX = 2000

const SPAM_PHRASES = ['telegram.me', 't.me/', 'wa.me/', 'crypto airdrop', 'buy followers', 'free btc', 'whatsapp me']
const PROFANITY = /\b(fuck|shit|bitch|asshole|cunt)\b/i

/** Same rules as private.reject_spam. Returns an error string, or ''. */
export function messageProblem(text) {
  const value = String(text || '')
  if (!value.trim()) return 'Write a message first.'
  if (value.length > MESSAGE_MAX) return 'That message is too long.'
  const links = value.match(/https?:\/\/|www\./gi)
  if (links && links.length > 2) return 'Too many links. Keep it to a couple.'
  const lowered = value.toLowerCase()
  if (SPAM_PHRASES.some(phrase => lowered.includes(phrase))) return 'That looks like spam.'
  if (PROFANITY.test(value)) return 'Keep it clean. No strong profanity.'
  return ''
}

export const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['DC', 'District of Columbia']
]

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function milesBetween(lat1, lng1, lat2, lng2) {
  const t = Math.PI / 180
  const x = (lat2 - lat1) * t
  const y = (lng2 - lng1) * t
  const q = Math.sin(x / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(y / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(q)))
}

export function formatDist(miles, units) {
  if (units === 'km') return Math.round(miles * 1.609) + ' km'
  return miles + ' mi'
}

export function hueFromId(id) {
  let h = 0
  const s = String(id || '')
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 360
  return h
}

export function isZip(q) {
  return /^\d{5}$/.test(String(q || '').trim())
}

export function safeHttps(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.href : ''
  } catch (e) {
    return ''
  }
}

// cities: [name, state, lat, lng]
export function searchCities(cities, query, limit = 40) {
  const raw = String(query || '').trim().toLowerCase()
  if (raw.length < 2 || isZip(raw)) return []
  let cityQ = raw
  let stateQ = ''
  const m = raw.match(/^(.*?)(?:,\s*|\s+)([a-z]{2})$/)
  if (m && m[1].trim()) {
    cityQ = m[1].trim()
    stateQ = m[2].toUpperCase()
  }
  const starts = []
  const contains = []
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i]
    if (stateQ && c[1] !== stateQ) continue
    const name = c[0].toLowerCase()
    if (name.startsWith(cityQ)) starts.push(c)
    else if (cityQ.length >= 3 && name.includes(cityQ)) contains.push(c)
    if (starts.length >= limit && contains.length >= limit) break
  }
  return starts.concat(contains).slice(0, limit)
}

export function nearestCity(cities, lat, lng) {
  let best = null
  let bd = Infinity
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i]
    const d = milesBetween(lat, lng, c[2], c[3])
    if (d < bd) {
      bd = d
      best = c
    }
  }
  if (!best) return null
  return { city: best[0], state: best[1], lat: best[2], lng: best[3], miles: bd }
}

export function findCity(cities, city, state) {
  const n = String(city || '').trim().toLowerCase()
  const st = String(state || '').trim().toUpperCase()
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i]
    if (c[0].toLowerCase() === n && c[1] === st) return { city: c[0], state: c[1], lat: c[2], lng: c[3] }
  }
  return null
}

export function compat(me, p) {
  const wd = Math.abs(W.indexOf(me.w) - W.indexOf(p.w))
  const ed = Math.abs(E.indexOf(me.exp) - E.indexOf(p.exp))
  const idf = Math.abs(INT.indexOf(me.int) - INT.indexOf(p.int))
  const weightKnown = W.indexOf(me.w) > 0 && W.indexOf(p.w) > 0
  const expKnown = E.indexOf(me.exp) > 0 && E.indexOf(p.exp) > 0
  const intKnown = INT.indexOf(me.int) >= 0 && INT.indexOf(p.int) >= 0
  const sharedDays = (me.dy || []).filter(d => (p.dy || []).indexOf(d) >= 0)
  const sharedTimes = (me.tm || []).filter(t => (p.tm || []).indexOf(t) >= 0)
  let sst
  let sp
  let sched
  if (!(me.dy || []).length) {
    sst = 'unset'
    sp = 8
    sched = 'You have not set your schedule'
  } else if (!sharedDays.length) {
    sst = 'off'
    sp = 0
    sched = 'No shared days yet'
  } else {
    sst = (!(me.tm || []).length || sharedTimes.length) ? 'match' : 'near'
    sp = 8 + Math.min(4, sharedDays.length * 2) + ((!(me.tm || []).length || sharedTimes.length) ? 3 : 0)
    sched = 'Shared: ' + sharedDays.join(', ') + ((me.tm || []).length && !sharedTimes.length ? ' (different time of day)' : '')
  }
  const sameGoal = me.gl && me.gl === p.gl
  const dist = typeof p.d === 'number' ? p.d : 999
  const dd = dist <= 10 ? 'match' : dist <= 25 ? 'near' : 'off'
  const rows = [
    weightKnown
      ? { k: 'Weight', s: wd === 0 ? 'match' : wd === 1 ? 'near' : 'off', pts: [25, 15, 4, 0, 0, 0][wd] || 0, t: p.w + (wd === 0 ? ', same as you' : wd === 1 ? ', one class apart' : ', ' + wd + ' classes apart') }
      : { k: 'Weight', s: 'unset', pts: 0, t: p.w || 'Not set' },
    expKnown
      ? { k: 'Experience', s: ed === 0 ? 'match' : ed === 1 ? 'near' : 'off', pts: [20, 12, 3][ed] || 0, t: p.exp + (ed === 0 ? ', same as you' : ed === 1 ? ', one level apart' : ', two levels apart') }
      : { k: 'Experience', s: 'unset', pts: 0, t: p.exp || 'Not set' },
    intKnown
      ? { k: 'Intensity', s: idf === 0 ? 'match' : idf === 1 ? 'near' : 'off', pts: [20, 12, 4, 0][idf] || 0, t: p.int + (idf === 0 ? ', same as you' : ', you prefer ' + me.int) }
      : { k: 'Intensity', s: 'unset', pts: 0, t: p.int || 'Not set' },
    { k: 'Goal', s: sameGoal ? 'match' : 'off', pts: sameGoal ? 15 : 5, t: (p.gl || 'Not set') + (sameGoal ? ', same as you' : '') },
    { k: 'Schedule', s: sst, pts: sp, t: dayStr(p.dy, p.tm) + '. ' + sched },
    { k: 'Distance', s: dd, pts: dist <= 10 ? 5 : dist <= 25 ? 3 : 0, t: (typeof p.d === 'number' ? p.d + ' mi' : 'Unknown') + ' away' }
  ]
  const score = rows.reduce((a, x) => a + x.pts, 0)
  return {
    score,
    label: score >= 80 ? 'Strong match' : score >= 60 ? 'Good match' : 'Partial match',
    rows,
    warn: (weightKnown && wd >= 2) || (expKnown && ed >= 2) || (intKnown && idf >= 2)
  }
}

export function dayStr(days, times) {
  const d = (days || []).slice().sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
  let t
  if (d.join() === 'Mon,Tue,Wed,Thu,Fri') t = 'Weekdays'
  else if (d.join() === 'Sat,Sun') t = 'Weekends'
  else t = d.join(', ') || 'Not set'
  return t + ((times || []).length ? ' · ' + times.join(' / ') : '')
}

export function filterDeck(people, opts) {
  const filters = opts.filters || {}
  const swiped = opts.swiped || new Set()
  const blocked = opts.blocked || new Set()
  const maxMiles = opts.maxMiles
  const me = opts.me
  const rows = people.filter(p => {
    if (p.id === opts.selfId) return false
    if (swiped.has(p.id) || blocked.has(p.id)) return false
    if (typeof p.d !== 'number' || p.d > maxMiles) return false
    if (filters.verified && !p.v) return false
    if (filters.w && filters.w !== 'All' && p.w !== filters.w) return false
    if (filters.e && filters.e !== 'All' && p.exp !== filters.e) return false
    if (filters.i && filters.i !== 'All' && p.int !== filters.i) return false
    if (filters.g && filters.g !== 'All' && p.gl !== filters.g) return false
    if (filters.dy && filters.dy.length && !filters.dy.some(d => (p.dy || []).indexOf(d) >= 0)) return false
    return true
  })
  rows.forEach(p => { p.score = compat(me, p).score })
  const near = opts.sort === 'near'
  rows.sort((a, b) => near ? (a.d - b.d || b.score - a.score) : (b.score - a.score || a.d - b.d))
  return rows
}

export function parseSlot(label) {
  const m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\d{1,2}):(\d{2})(am|pm)$/.exec(String(label || ''))
  if (!m) return null
  let hour = Number(m[2]) % 12
  if (m[4] === 'pm') hour += 12
  return { day: m[1], hour, minute: Number(m[3]) }
}

export function nextOccurrence(dayName, hour24, minute, now = new Date()) {
  const want = DAY_INDEX[dayName]
  if (want == null) return null
  const d = new Date(now.getTime())
  d.setSeconds(0, 0)
  d.setHours(hour24, minute, 0, 0)
  let add = (want - d.getDay() + 7) % 7
  if (add === 0 && d <= now) add = 7
  d.setDate(d.getDate() + add)
  return d
}

export function orderedPair(a, b) {
  return a < b ? [a, b] : [b, a]
}

export function gymVisibleTo(gym, uid) {
  if (!gym) return false
  if (gym.status === 'approved' || gym.status == null) return true
  return !!uid && gym.submitted_by === uid
}

export const EMAIL_RATE_LIMIT_MESSAGE = 'Too many sign-in emails were sent recently. Wait a few minutes and try again, or use Google.'
export const RESEND_COOLDOWN_MS = 60000

export function emailLooksValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

/** Digits only, capped at the 6-digit email code. */
export function normalizeEmailCode(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 6)
}

/** Empty string when the code is ready to send to Supabase. */
export function emailCodeProblem(raw) {
  const code = normalizeEmailCode(raw)
  if (!code) return 'Enter the 6-digit code from the email.'
  if (code.length !== 6) return 'Enter all 6 digits from the email.'
  return ''
}

/**
 * Friendly copy for a failed auth call. A thrown Error, a Supabase error
 * object, or a plain { status, code, message } all work.
 */
export function authProblem(error) {
  if (!error) return ''
  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || error.error_code || '')
  const msg = String(error.message || error.error_description || error.msg || (typeof error === 'string' ? error : ''))
  const blob = (code + ' ' + msg).toLowerCase()
  if (status === 429 || /over_email_send_rate_limit|over_request_rate_limit|rate limit|too many requests/.test(blob)) {
    return EMAIL_RATE_LIMIT_MESSAGE
  }
  if (/provider is not enabled|unsupported provider/.test(blob)) {
    return 'Google sign-in is not switched on yet. Use your email for now.'
  }
  if (code === 'otp_expired' || /token has expired|invalid otp|otp has expired|email link is invalid or has expired/.test(blob)) {
    return 'That code did not work. Check the 6 digits, or resend the email.'
  }
  if (/failed to fetch|networkerror|load failed|network request failed/.test(blob)) {
    return 'You are offline or the server did not answer.'
  }
  if (status >= 500) return 'Sign-in is having trouble right now. Try again in a minute, or use Google.'
  if (msg.trim()) return msg.trim()
  return 'Something went wrong. Try again.'
}

/** Success screen only when the email request itself succeeded. */
export function signInEmailResult(error) {
  if (error) return { ok: false, message: authProblem(error) }
  return { ok: true, message: '' }
}

/** Whole seconds left before another sign-in email can be requested. */
export function resendWaitSec(sentAt, now = Date.now()) {
  const sent = Number(sentAt)
  if (!sent) return 0
  const leftMs = RESEND_COOLDOWN_MS - (now - sent)
  if (leftMs <= 0) return 0
  return Math.ceil(leftMs / 1000)
}

/** Profile choices that a chip tap can change. Copied so a later edit cannot mutate the saved copy. */
export function choiceSnapshot(me) {
  const src = me || {}
  return {
    w: src.w,
    exp: src.exp,
    st: src.st,
    int: src.int,
    gl: src.gl,
    dy: Array.isArray(src.dy) ? src.dy.slice() : [],
    tm: Array.isArray(src.tm) ? src.tm.slice() : [],
    gymId: src.gymId == null ? null : src.gymId,
    gym: src.gym || ''
  }
}

/** Nearest rows first. Rows without coordinates sort last. Does not mutate the input. */
export function sortByDistance(rows, lat, lng) {
  const originLat = Number(lat)
  const originLng = Number(lng)
  return (rows || []).slice().sort((a, b) => {
    const da = a == null || a.lat == null || a.lng == null ? Infinity : milesBetween(originLat, originLng, a.lat, a.lng)
    const db = b == null || b.lat == null || b.lng == null ? Infinity : milesBetween(originLat, originLng, b.lat, b.lng)
    return da - db
  })
}

/** Put the last saved choices back. No-op when there is nothing to restore. */
export function restoreChoices(me, snap) {
  if (!me || !snap) return me
  me.w = snap.w
  me.exp = snap.exp
  me.st = snap.st
  me.int = snap.int
  me.gl = snap.gl
  me.dy = snap.dy.slice()
  me.tm = snap.tm.slice()
  me.gymId = snap.gymId
  me.gym = snap.gym
  return me
}
