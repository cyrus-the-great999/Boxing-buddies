import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.81.1/+esm'
import {
  DAYS, TIMES, INT, GOALS, W, E, STATES, CONFIRMATIONS_REQUIRED,
  milesBetween, formatDist, hueFromId, isZip, safeHttps, searchCities, nearestCity, findCity,
  compat, dayStr, filterDeck, parseSlot, nextOccurrence, orderedPair, messageProblem
} from './logic.mjs'

// The publishable key is meant for the browser. Do not put a secret key here.
const SUPABASE_URL = 'https://evgdadutsupnxywtgfxh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_ggXr2z1_VxiQ5_dEdp6r0g_WNjufitP'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
})

const INTHELP = {
  Technical: 'No hard shots, work on skills',
  Light: 'Controlled, around 50 to 60 percent',
  Moderate: 'Working rounds, 70 to 80 percent',
  Hard: 'Fight pace, experienced boxers only'
}
const REASONS = ['Aggressive or unsafe behavior', 'Harassment or inappropriate messages', 'Fake or misleading profile', 'Spam or selling something', 'Something else']
const SAFE = [
  'Spar at a gym with a coach or staff nearby. Do not meet at a home or park for a first session.',
  'Wear your gear: headgear, a mouthguard, and 14 to 16 oz gloves.',
  'Tell someone where you are going and when you expect to be back.',
  'Agree on intensity before round one, and say it again at the gym.',
  'Pick a stop word. Either of you can end a round at any time.',
  'Skip sparring when sick, injured, or after a head injury.',
  'Keep your address and personal details private until you trust each other.'
]
const STW = { match: 'Match', near: 'Close', off: 'Different', unset: 'Not set' }
const ICON = {
  discover: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 15h6"/></svg>',
  matches: '<svg viewBox="0 0 24 24"><path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13L21 3"/></svg>',
  gyms: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
}

const state = {
  booting: true,
  session: null,
  loadedFor: '',
  me: blankMe(),
  hasProfile: false,
  onb: 0,
  tab: 'discover',
  sheet: false,
  profiles: [],
  gyms: [],
  gymMigration: true,
  swiped: new Set(),
  blocks: [],
  matches: [],
  messages: {},
  sessions: [],
  openMatch: null,
  filters: { w: 'All', e: 'All', i: 'All', g: 'All', dy: [] },
  cfg: loadPrefs(),
  cities: null,
  cityPromise: null,
  unread: {},
  authEmail: '',
  authSent: false,
  authMsg: '',
  authErr: false,
  authBusy: false,
  loadingDeck: false,
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  locBusy: false,
  locMsg: '',
  locMsgErr: false,
  locQ: '',
  deciding: false,
  picBusy: false,
  picErr: '',
  msgDraft: '',
  msgQ: '',
  gymDraft: blankGym(),
  gymBusy: false,
  gymMsg: '',
  saving: false,
  agreeAdult: false,
  agreeTerms: false,
  channel: null,
  poll: 0
}

function blankMe() {
  return { n: '', a: '', h: '', w: 'Welterweight', exp: 'Intermediate', st: 'Orthodox', int: 'Light', gl: 'Technical work', gloves: '', dy: [], tm: [], gymId: null, gym: '', bio: '', avatar_url: '', town: '', lat: null, lng: null, v: false }
}
function blankGym() {
  return { name: '', address: '', city: '', state: 'MA', website: '' }
}
function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem('bb-prefs') || '{}')
    return {
      theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'dark',
      maxd: Math.min(200, Math.max(5, Number(s.maxd) || 50)),
      units: s.units === 'km' ? 'km' : 'mi',
      verified: !!s.verified,
      nMatch: s.nMatch !== false,
      nMsg: s.nMsg !== false,
      sort: s.sort === 'near' ? 'near' : 'fit',
      ack: !!s.ack
    }
  } catch (e) {
    return { theme: 'dark', maxd: 50, units: 'mi', verified: false, nMatch: true, nMsg: true, sort: 'fit', ack: false }
  }
}
function savePrefs() {
  localStorage.setItem('bb-prefs', JSON.stringify(state.cfg))
}
function uid() { return state.session && state.session.user.id }
function unreadKey() { return 'bb-unread:' + uid() }
function blockKey() { return 'bb-blocks:' + uid() }
function loadUnread() {
  try { return JSON.parse(localStorage.getItem(unreadKey()) || '{}') } catch (e) { return {} }
}
function saveUnread() { localStorage.setItem(unreadKey(), JSON.stringify(state.unread)) }
function loadBlockNames() {
  try { return JSON.parse(localStorage.getItem(blockKey()) || '{}') } catch (e) { return {} }
}
function rememberBlock(id, name) {
  const map = loadBlockNames()
  map[id] = name
  localStorage.setItem(blockKey(), JSON.stringify(map))
}

const $ = (s) => document.querySelector(s)
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}
function errText(error) {
  const msg = (error && (error.message || error.error_description)) || 'Something went wrong'
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return 'Google sign-in is not switched on yet. Use your email for now.'
  if (/submit_gym/i.test(msg) && /schema cache|Could not find the function|PGRST202/i.test(msg)) return 'Adding a gym needs the database update in supabase/migrations. Apply that file, then try again.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'You are offline or the server did not answer.'
  return msg
}
let toastTimer = 0
function toast(m, k, act) {
  const t = document.getElementById('toast')
  if (!t) return
  t.innerHTML = '<div class="toast' + (k ? ' ' + k : '') + '">' + esc(m) + (act ? '<button class="tact" id="tact">' + esc(act.label) + '</button>' : '') + '</div>'
  if (act) document.getElementById('tact').onclick = () => { t.innerHTML = ''; clearTimeout(toastTimer); act.fn() }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.innerHTML = '' }, act ? 5000 : 2800)
}
function dist(m) { return formatDist(m, state.cfg.units) }
function locLabel() {
  if (!state.cfg.loc) return 'you'
  return state.cfg.loc.name === 'Current location' ? 'your location' : state.cfg.loc.name
}
function applyTheme() {
  const r = document.documentElement
  if (state.cfg.theme === 'system') delete r.dataset.theme
  else r.dataset.theme = state.cfg.theme
}
function ini(p) {
  return String(p.n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function col(p) { return 'linear-gradient(160deg,hsl(' + (p.hue || 20) + ' 28% 32%),#12141c 85%)' }
function markSvg() {
  return '<svg class="mark" viewBox="0 0 527 536" aria-hidden="true"><path fill="#F05A28" fill-rule="evenodd" d="M228 0 L44 106 L26 241 L53 262 L17 285 L0 410 L231 536 L237 513 L236 8Z M143 287 L170 299 L175 309 L170 433 L83 388 L68 373 L81 316Z M171 104 L174 225 L166 233 L143 235 L97 208 L99 148 L107 137Z M293 1 L288 529 L298 536 L515 421 L527 402 L507 284 L469 259 L499 240 L481 106Z M354 104 L421 143 L429 196 L424 211 L368 245 L358 279 L441 315 L451 328 L458 368 L454 382 L356 435 L350 431 L348 223Z"/></svg>'
}
function gloveArt() {
  return '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M72 150h58v34a4 4 0 0 1-4 4H76a4 4 0 0 1-4-4z" fill="#1b1b1e"/><path d="M72 162h58M72 174h58" stroke="#3a3a40" stroke-width="2"/><path d="M72 150C58 140 52 122 53 100 54 66 78 40 112 38c32-2 54 20 52 52-1 20-8 34-20 44-6 5-10 10-14 16z" fill="#1b1b1e"/><path d="M56 104c-16-4-26 10-20 24 5 12 22 16 34 8" fill="#1b1b1e"/><path d="M84 70c12-6 34-6 52 4M76 92c18-6 46-4 72 6" stroke="#3a3a40" stroke-width="2"/><path d="M118 50c14 0 26 8 32 20" stroke-width="2.5"/></svg>'
}
function bagArt() {
  return '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M100 8v26M84 34h32" stroke="#7E7E87"/><rect x="68" y="42" width="64" height="132" rx="8" fill="#1b1b1e"/><path d="M68 70h64M68 148h64M76 54v112" stroke="#3a3a40" stroke-width="2"/><rect x="68" y="96" width="64" height="26" fill="currentColor" stroke="none"/></svg>'
}
function emptyArt(k) { return '<div class="empty-art" style="color:var(--mute)">' + (k === 'bag' ? bagArt() : gloveArt()) + '</div>' }

function toCard(row) {
  const linked = row.home_gym || row.gyms
  const gym = linked && !Array.isArray(linked) ? linked : null
  const loc = state.cfg.loc
  let d = null
  if (loc && row.lat != null && row.lng != null) d = Math.max(1, Math.round(milesBetween(loc.lat, loc.lng, row.lat, row.lng)))
  return {
    id: row.id,
    n: row.display_name || 'Boxer',
    a: row.age || '',
    h: row.height || '',
    w: row.weight_class || '',
    exp: row.experience || '',
    st: row.stance || '',
    int: row.intensity || '',
    gl: row.goal || '',
    bio: row.bio || '',
    dy: row.availability_days || [],
    tm: row.availability_times || [],
    gym: gym ? gym.name : (row.town || 'Gym not set'),
    gymId: row.home_gym_id,
    d, lat: row.lat, lng: row.lng,
    v: !!row.verified,
    avatar_url: row.avatar_url || '',
    town: row.town || '',
    hue: hueFromId(row.id)
  }
}
function fromProfile(row) {
  const card = toCard(row)
  state.me = {
    n: row.display_name || '',
    a: row.age || '',
    h: row.height || '',
    w: row.weight_class || 'Welterweight',
    exp: row.experience || 'Intermediate',
    st: row.stance || 'Orthodox',
    int: row.intensity || 'Light',
    gl: row.goal || 'Technical work',
    gloves: row.gloves || '',
    dy: row.availability_days || [],
    tm: row.availability_times || [],
    gymId: row.home_gym_id,
    gym: card.gym === 'Gym not set' ? '' : card.gym,
    bio: row.bio || '',
    avatar_url: row.avatar_url || '',
    town: row.town || '',
    lat: row.lat, lng: row.lng, v: !!row.verified,
    adultConfirmed: !!row.adult_confirmed,
    termsAcceptedAt: row.terms_accepted_at || null,
    safetyAt: row.safety_acknowledged_at || null
  }
  if (row.safety_acknowledged_at) state.cfg.ack = true
  if (row.lat != null && row.lng != null) {
    state.cfg.loc = { name: row.town || 'Your location', lat: row.lat, lng: row.lng, src: 'profile' }
  }
}
function pool() {
  return filterDeck(state.profiles, {
    selfId: uid(),
    me: state.me,
    maxMiles: state.cfg.maxd,
    sort: state.cfg.sort,
    swiped: state.swiped,
    blocked: new Set(state.blocks.map(b => b.id)),
    filters: state.filters
  })
}
function nearbyGyms() {
  const loc = state.cfg.loc
  return state.gyms.map(g => {
    const mi = loc && g.lat != null ? Math.max(1, Math.round(milesBetween(loc.lat, loc.lng, g.lat, g.lng))) : null
    return Object.assign({}, g, { mi })
  }).filter(g => g.submitted_by === uid() || (g.mi != null && g.mi <= state.cfg.maxd))
    .sort((a, b) => (a.mi ?? 9999) - (b.mi ?? 9999))
}
function matchById(id) { return state.matches.find(m => String(m.id) === String(id)) }
function msgs(id) { return state.messages[String(id)] || [] }

function payload() {
  const me = state.me
  const loc = state.cfg.loc
  const age = me.a === '' || me.a == null ? null : Number(me.a)
  return {
    id: uid(),
    display_name: String(me.n || '').trim(),
    age: Number.isInteger(age) ? age : null,
    height: me.h ? String(me.h).slice(0, 20) : null,
    town: loc ? loc.name : (me.town || null),
    lat: loc ? loc.lat : me.lat,
    lng: loc ? loc.lng : me.lng,
    weight_class: me.w,
    experience: me.exp,
    stance: me.st,
    intensity: me.int,
    goal: me.gl,
    gloves: me.gloves ? String(me.gloves).slice(0, 40) : null,
    availability_days: (me.dy || []).filter(d => DAYS.includes(d)),
    availability_times: (me.tm || []).filter(t => TIMES.includes(t)),
    home_gym_id: me.gymId ? Number(me.gymId) : null,
    bio: me.bio ? String(me.bio).slice(0, 500) : null,
    avatar_url: me.avatar_url || null,
    adult_confirmed: !!me.adultConfirmed,
    terms_accepted_at: me.termsAcceptedAt || null,
    safety_acknowledged_at: me.safetyAt || null
  }
}
function validateProfile(p, strict) {
  if (p.display_name.length < 1 || p.display_name.length > 60) return 'Enter your name, up to 60 characters.'
  if (p.bio && messageProblem(p.bio)) return messageProblem(p.bio)
  if (strict && (p.age == null || p.age < 18 || p.age > 100)) return 'Boxing Buddies is for adults 18 to 100.'
  if (p.age != null && (p.age < 18 || p.age > 100)) return 'Boxing Buddies is for adults 18 to 100.'
  if (strict && (typeof p.lat !== 'number' || typeof p.lng !== 'number')) return 'Set a US location before you start.'
  if (strict && !p.adult_confirmed) return 'Confirm that you are 18 or older.'
  if (strict && !p.terms_accepted_at) return 'Agree to the Terms and Privacy Policy to continue.'
  return ''
}

async function saveProfile(opts) {
  const quiet = opts && opts.quiet
  const p = payload()
  const problem = validateProfile(p, false)
  if (problem) { if (!quiet) toast(problem, 'err'); return false }
  const { data, error } = await supabase.from('profiles').upsert(p).select('*, home_gym:gyms!profiles_home_gym_id_fkey(id,name,town,state)').single()
  if (error) { if (!quiet) toast(errText(error), 'err'); return false }
  if (!(opts && opts.keepLocal)) fromProfile(data)
  state.hasProfile = true
  return true
}

async function loadSwipes() {
  const { data, error } = await supabase.from('swipes').select('target_id').eq('swiper_id', uid())
  if (error) throw error
  state.swiped = new Set((data || []).map(r => r.target_id))
}
async function loadBlocks() {
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', uid())
  if (error) throw error
  const names = loadBlockNames()
  state.blocks = (data || []).map(r => ({ id: r.blocked_id, name: names[r.blocked_id] || 'Blocked boxer' }))
}
async function loadGyms() {
  const full = 'id,name,address,town,state,lat,lng,website,status,submitted_by,confirmation_count'
  const base = 'id,name,address,town,state,lat,lng'
  const run = (cols) => {
    let q = supabase.from('gyms').select(cols)
    const loc = state.cfg.loc
    if (loc && state.gymMigration) {
      const pad = state.cfg.maxd / 69
      const cos = Math.max(0.2, Math.abs(Math.cos(loc.lat * Math.PI / 180)))
      const padLng = state.cfg.maxd / (69 * cos)
      const box = ['lat.gte.' + (loc.lat - pad).toFixed(5), 'lat.lte.' + (loc.lat + pad).toFixed(5), 'lng.gte.' + (loc.lng - padLng).toFixed(5), 'lng.lte.' + (loc.lng + padLng).toFixed(5)].join(',')
      q = q.or('and(' + box + '),submitted_by.eq.' + uid())
    }
    return q.limit(400)
  }
  let res = await run(state.gymMigration ? full : base)
  if (res.error && /column|schema cache/i.test(res.error.message || '')) {
    state.gymMigration = false
    res = await run(base)
  }
  if (res.error) throw res.error
  state.gyms = res.data || []
}
async function loadDeck() {
  state.loadingDeck = true
  const loc = state.cfg.loc
  if (!loc) { state.profiles = []; state.loadingDeck = false; return }
  const pad = state.cfg.maxd / 69
  const cos = Math.max(0.2, Math.abs(Math.cos(loc.lat * Math.PI / 180)))
  const padLng = state.cfg.maxd / (69 * cos)
  const { data, error } = await supabase.from('profiles')
    .select('id,display_name,age,height,town,lat,lng,weight_class,experience,stance,intensity,goal,gloves,availability_days,availability_times,home_gym_id,bio,avatar_url,verified,home_gym:gyms!profiles_home_gym_id_fkey(id,name,town,state)')
    .neq('id', uid())
    .gte('lat', loc.lat - pad).lte('lat', loc.lat + pad)
    .gte('lng', loc.lng - padLng).lte('lng', loc.lng + padLng)
    .limit(200)
  state.loadingDeck = false
  if (error) throw error
  state.profiles = (data || []).map(toCard)
}
async function loadMatches() {
  const { data: rows, error } = await supabase.from('matches').select('id,user_a,user_b,created_at').order('created_at', { ascending: false })
  if (error) throw error
  const ids = [...new Set((rows || []).flatMap(r => [r.user_a, r.user_b]).filter(id => id !== uid()))]
  let people = []
  if (ids.length) {
    const { data, error: e2 } = await supabase.from('profiles').select('id,display_name,age,height,town,lat,lng,weight_class,experience,stance,intensity,goal,gloves,availability_days,availability_times,home_gym_id,bio,avatar_url,verified,home_gym:gyms!profiles_home_gym_id_fkey(id,name,town,state)').in('id', ids)
    if (e2) throw e2
    people = data || []
  }
  const byId = Object.fromEntries(people.map(p => [p.id, toCard(p)]))
  state.matches = (rows || []).map(r => {
    const pid = r.user_a === uid() ? r.user_b : r.user_a
    if (!byId[pid]) return null
    return { id: r.id, partner: byId[pid], created_at: r.created_at }
  }).filter(Boolean)
  const mids = state.matches.map(m => m.id)
  state.messages = {}
  state.sessions = []
  if (!mids.length) return
  const { data: messages, error: e3 } = await supabase.from('messages').select('id,match_id,sender_id,body,created_at').in('match_id', mids).order('created_at', { ascending: true }).limit(800)
  if (e3) throw e3
  for (const m of state.matches) state.messages[String(m.id)] = []
  for (const msg of messages || []) (state.messages[String(msg.match_id)] || (state.messages[String(msg.match_id)] = [])).push(msg)
  const { data: sessions, error: e4 } = await supabase.from('sessions').select('id,match_id,proposer_id,gym_id,starts_at,intensity,note,status,gyms(name,address,town,state)').in('match_id', mids).order('starts_at', { ascending: true })
  if (e4) throw e4
  state.sessions = sessions || []
}
async function loadAll() {
  const { data: row, error } = await supabase.from('profiles').select('*, home_gym:gyms!profiles_home_gym_id_fkey(id,name,town,state)').eq('id', uid()).maybeSingle()
  if (error) throw error
  if (row) {
    fromProfile(row)
    state.hasProfile = true
    state.onb = row.adult_confirmed && row.terms_accepted_at ? 0 : 3
  } else {
    state.me = blankMe()
    state.hasProfile = false
    state.onb = 1
  }
  state.unread = loadUnread()
  await Promise.all([loadSwipes(), loadBlocks(), loadGyms()])
  await Promise.all([loadDeck(), state.hasProfile ? loadMatches() : Promise.resolve()])
  ensureCities().catch(() => {})
}
function subscribe() {
  if (state.channel) supabase.removeChannel(state.channel)
  state.channel = supabase.channel('bb-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => onIncoming(payload.new))
    .subscribe()
  clearInterval(state.poll)
  state.poll = setInterval(() => {
    if (document.visibilityState === 'visible' && state.hasProfile) refreshMatches().catch(() => {})
  }, 20000)
}
async function refreshMatches() {
  const before = new Set(state.matches.map(m => String(m.id)))
  await loadMatches()
  const fresh = state.matches.filter(m => !before.has(String(m.id)))
  if (fresh.length && state.cfg.nMatch) toast('New match with ' + fresh[0].partner.n)
  if (fresh.length && state.tab === 'matches') render()
}
function addMessage(row) {
  const key = String(row.match_id)
  const list = state.messages[key] || (state.messages[key] = [])
  if (list.some(m => String(m.id) === String(row.id))) return false
  list.push(row)
  return true
}
function onIncoming(row) {
  if (!row) return
  const mid = String(row.match_id)
  if (!state.matches.some(m => String(m.id) === mid)) {
    refreshMatches().then(() => { if (addMessage(row)) render() }).catch(() => {})
    return
  }
  if (!addMessage(row)) return
  const viewing = state.tab === 'matches' && String(state.openMatch) === mid
  if (viewing) {
    delete state.unread[mid]
    saveUnread()
    render()
    return
  }
  if (row.sender_id !== uid()) {
    state.unread[mid] = 1
    saveUnread()
    if (state.cfg.nMsg) {
      const m = matchById(mid)
      toast('New message from ' + (m ? m.partner.n : 'your match'))
    }
    if (state.tab === 'matches' && !state.openMatch) render()
  }
}

function resetUser() {
  if (state.channel) supabase.removeChannel(state.channel)
  clearInterval(state.poll)
  state.channel = null
  state.loadedFor = ''
  state.me = blankMe()
  state.hasProfile = false
  state.onb = 0
  state.profiles = []
  state.gyms = []
  state.swiped = new Set()
  state.blocks = []
  state.matches = []
  state.messages = {}
  state.sessions = []
  state.openMatch = null
  state.sheet = false
  state.unread = {}
  state.authSent = false
  state.authMsg = ''
}
async function handleAuth(event, session) {
  if (event === 'TOKEN_REFRESHED') { state.session = session; return }
  if (event === 'SIGNED_OUT') {
    state.session = null
    resetUser()
    state.booting = false
    render()
    return
  }
  if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return
  state.session = session
  state.booting = false
  if (!session) { render(); return }
  if (state.loadedFor === session.user.id) return
  state.loadedFor = session.user.id
  try {
    await loadAll()
    subscribe()
    const dirty = location.search.includes('code=') || location.hash.includes('access_token') || location.hash.includes('error')
    if (dirty) history.replaceState(null, '', location.pathname)
  } catch (e) {
    state.loadedFor = ''
    toast(errText(e), 'err')
  }
  render()
}

function ensureCities() {
  if (state.cities) return Promise.resolve(state.cities)
  if (!state.cityPromise) {
    state.cityPromise = fetch('data/us-cities.json').then(r => {
      if (!r.ok) throw new Error('City list failed to load')
      return r.json()
    }).then(rows => { state.cities = rows; return rows })
  }
  return state.cityPromise
}
async function lookupZip(zip) {
  const res = await fetch('https://api.zippopotam.us/us/' + zip)
  if (!res.ok) throw new Error('No US ZIP code matches ' + zip + '.')
  const data = await res.json()
  const p = data.places && data.places[0]
  if (!p) throw new Error('No US ZIP code matches ' + zip + '.')
  return {
    name: p['place name'] + ', ' + p['state abbreviation'],
    city: p['place name'],
    state: p['state abbreviation'],
    lat: Number(p.latitude),
    lng: Number(p.longitude)
  }
}
let lastGeo = 0
async function geocodeAddress(address, city, st) {
  const q = address + ', ' + city + ', ' + st + ', USA'
  const key = 'bb-geo:' + q.toLowerCase()
  try {
    const cached = sessionStorage.getItem(key)
    if (cached) return JSON.parse(cached)
  } catch (e) {}
  const wait = 1100 - (Date.now() - lastGeo)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastGeo = Date.now()
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=' + encodeURIComponent(q)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 429) throw new Error('Address lookup is busy. Wait a few seconds and try again.')
  if (!res.ok) throw new Error('Address lookup failed. Try again.')
  const data = await res.json()
  const hit = data && data[0]
  if (!hit) return null
  const cc = hit.address && hit.address.country_code
  if (cc && cc !== 'us') return null
  const point = { lat: Number(hit.lat), lng: Number(hit.lon), approx: false }
  try { sessionStorage.setItem(key, JSON.stringify(point)) } catch (e) {}
  return point
}

async function setLocation(loc) {
  state.cfg.loc = { name: loc.name, lat: loc.lat, lng: loc.lng, src: loc.src || 'town' }
  state.me.lat = loc.lat
  state.me.lng = loc.lng
  state.me.town = loc.name
  state.locMsg = ''
  state.locMsgErr = false
  if (state.hasProfile) {
    const ok = await saveProfile()
    if (!ok) return
  }
  await Promise.all([loadGyms(), loadDeck()])
  toast('Location set to ' + loc.name)
  render()
}
function useGps() {
  if (state.locBusy) return
  if (!navigator.geolocation) { state.locMsg = 'This browser cannot share your location. Search for a city or ZIP instead.'; state.locMsgErr = true; render(); return }
  state.locBusy = true
  state.locMsg = ''
  state.locMsgErr = false
  render()
  navigator.geolocation.getCurrentPosition(async (pos) => {
    state.locBusy = false
    try {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      const cities = await ensureCities().catch(() => [])
      const near = cities.length ? nearestCity(cities, lat, lng) : null
      const name = near && near.miles <= 30 ? ('Near ' + near.city + ', ' + near.state) : 'Current location'
      await setLocation({ name, lat, lng, src: 'gps' })
    } catch (e) { state.locMsg = errText(e); state.locMsgErr = true; render() }
  }, (err) => {
    state.locBusy = false
    state.locMsgErr = true
    state.locMsg = err && err.code === 1 ? 'Location access is blocked. Allow it in the browser, or search for a city.' : 'Your location is not available right now. Search for a city or ZIP.'
    render()
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 })
}

async function sendMagic() {
  const email = state.authEmail.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { state.authErr = true; state.authMsg = 'Enter a valid email address.'; render(); return }
  state.authBusy = true
  state.authErr = false
  state.authMsg = ''
  render()
  const redirect = location.origin + location.pathname
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } })
  state.authBusy = false
  if (error) { state.authErr = true; state.authMsg = errText(error); render(); return }
  state.authSent = true
  state.authMsg = ''
  render()
}
async function verifyCode() {
  const token = ($('#code') && $('#code').value || '').trim()
  if (!token) { state.authErr = true; state.authMsg = 'Enter the code from the email.'; render(); return }
  state.authBusy = true
  render()
  const { error } = await supabase.auth.verifyOtp({ email: state.authEmail.trim(), token, type: 'email' })
  state.authBusy = false
  if (error) { state.authErr = true; state.authMsg = errText(error); render() }
}
async function google() {
  state.authBusy = true
  state.authErr = false
  state.authMsg = ''
  render()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname }
  })
  if (error) { state.authBusy = false; state.authErr = true; state.authMsg = errText(error); render() }
}
async function signOut() {
  await supabase.auth.signOut()
  resetUser()
  state.session = null
  state.booting = false
  render()
}

async function decide(dir) {
  if (state.deciding || !state.hasProfile) return
  const top = pool()[0]
  if (!top) return
  state.deciding = true
  const el = document.querySelector('.card:not(.back)')
  if (el) {
    el.classList.remove('drag')
    el.style.transform = 'translateX(' + (dir > 0 ? 600 : -600) + 'px) rotate(' + dir * 25 + 'deg)'
    el.style.opacity = '0'
  }
  try { if (navigator.vibrate) navigator.vibrate(8) } catch (e) {}
  const action = dir > 0 ? 'spar' : 'pass'
  const { error } = await supabase.from('swipes').insert({ swiper_id: uid(), target_id: top.id, action })
  state.deciding = false
  if (error && error.code !== '23505') { toast(errText(error), 'err'); render(); return }
  state.swiped.add(top.id)
  const first = top.n.split(' ')[0]
  if (action === 'pass') { toast('Passed on ' + first); render(); return }
  const pair = orderedPair(uid(), top.id)
  const { data: match, error: e2 } = await supabase.from('matches').select('id').eq('user_a', pair[0]).eq('user_b', pair[1]).maybeSingle()
  if (e2) toast(errText(e2), 'err')
  render()
  if (match) {
    await loadMatches()
    render()
    if (state.cfg.nMatch) showMatch(top, match.id)
    else toast('It is a match with ' + first)
  } else toast('You want to spar with ' + first)
}

async function sendMessage() {
  const input = $('#txt')
  const body = (input ? input.value : state.msgDraft).trim().slice(0, 2000)
  const match = matchById(state.openMatch)
  if (!body || !match) return
  const problem = messageProblem(body)
  if (problem) { toast(problem, 'err'); return }
  if (input) input.value = ''
  state.msgDraft = ''
  const { data, error } = await supabase.from('messages').insert({ match_id: match.id, sender_id: uid(), body }).select('id,match_id,sender_id,body,created_at').single()
  if (error) { toast(errText(error), 'err'); if (input) input.value = body; return }
  addMessage(data)
  render()
}
async function proposeSession() {
  const match = matchById(state.openMatch)
  if (!match) return
  const slot = $('#slot').value
  const place = $('#splace').value
  const intensity = $('#sint').value
  const note = $('#snote').value.trim().slice(0, 500)
  const parsed = parseSlot(slot)
  if (!parsed) { toast('Pick a time.', 'err'); return }
  const when = nextOccurrence(parsed.day, parsed.hour, parsed.minute)
  const gym = state.gyms.find(g => String(g.id) === String(place))
  const dup = state.sessions.some(s => String(s.match_id) === String(match.id) && s.status !== 'cancelled' && s.status !== 'declined' && Math.abs(new Date(s.starts_at) - when) < 60000)
  if (dup) { toast('You already planned that time.', 'err'); return }
  const go = async () => {
    const { data, error } = await supabase.from('sessions').insert({
      match_id: match.id, proposer_id: uid(), gym_id: gym ? gym.id : null,
      starts_at: when.toISOString(), intensity, note: note || null, status: 'proposed'
    }).select('id,match_id,proposer_id,gym_id,starts_at,intensity,note,status,gyms(name,address,town,state)').single()
    if (error) { toast(errText(error), 'err'); return }
    state.sessions.push(data)
    const where = gym ? gym.name : 'a gym you will pick in chat'
    const text = 'Proposed session: ' + when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' at ' + where + '. Intensity: ' + intensity + '.' + (note ? ' ' + note : '')
    const sent = await supabase.from('messages').insert({ match_id: match.id, sender_id: uid(), body: text }).select('id,match_id,sender_id,body,created_at').single()
    if (sent.data) addMessage(sent.data)
    state.sheet = false
    state.cfg.ack = true
    state.me.safetyAt = state.me.safetyAt || new Date().toISOString()
    savePrefs()
    if (state.hasProfile) supabase.from('profiles').update({ safety_acknowledged_at: state.me.safetyAt }).eq('id', uid()).then(() => {})
    render()
    toast('Plan sent. Confirm the details in chat.')
  }
  if (!state.cfg.ack && !state.me.safetyAt) safetyDlg(go)
  else go()
}
async function setSessionStatus(id, status) {
  const row = state.sessions.find(s => String(s.id) === String(id))
  if (!row) return
  const { error } = await supabase.from('sessions').update({ status }).eq('id', row.id)
  if (error) { toast(errText(error), 'err'); return }
  row.status = status
  const verb = status === 'cancelled' ? 'Cancelled' : status === 'accepted' ? 'Accepted' : 'Declined'
  const text = verb + ' the session on ' + new Date(row.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.'
  const sent = await supabase.from('messages').insert({ match_id: row.match_id, sender_id: uid(), body: text }).select('id,match_id,sender_id,body,created_at').single()
  if (sent.data) addMessage(sent.data)
  render()
  toast('Session ' + status)
}
async function doBlock(person) {
  const { error } = await supabase.from('blocks').insert({ blocker_id: uid(), blocked_id: person.id })
  if (error && error.code !== '23505') { toast(errText(error), 'err'); return }
  rememberBlock(person.id, person.n)
  state.blocks = state.blocks.filter(b => b.id !== person.id).concat([{ id: person.id, name: person.n }])
  state.profiles = state.profiles.filter(p => p.id !== person.id)
  state.matches = state.matches.filter(m => m.partner.id !== person.id)
  if (state.openMatch && !matchById(state.openMatch)) state.openMatch = null
  state.sheet = false
  render()
  toast(person.n + ' blocked')
}
async function doUnblock(id) {
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', uid()).eq('blocked_id', id)
  if (error) { toast(errText(error), 'err'); return }
  state.blocks = state.blocks.filter(b => b.id !== id)
  await Promise.all([loadDeck(), loadMatches()])
  render()
  toast('Unblocked')
}
async function doReport(person, reason, details, alsoBlock) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: uid(), reported_id: person.id, reason, details: details || null
  })
  if (error) { toast(errText(error), 'err'); return }
  if (alsoBlock) await doBlock(person)
  else { render(); toast('Report sent') }
}
async function submitGym() {
  if (!state.gymMigration) { toast('Adding a gym needs the database update in supabase/migrations. Apply that file, then try again.', 'err'); return }
  const d = state.gymDraft
  d.name = ($('#gname') ? $('#gname').value : d.name).trim()
  d.address = ($('#gaddr') ? $('#gaddr').value : d.address).trim()
  d.city = ($('#gcity') ? $('#gcity').value : d.city).trim()
  d.state = ($('#gstate') ? $('#gstate').value : d.state)
  d.website = ($('#gweb') ? $('#gweb').value : d.website).trim()
  state.gymDraft = d
  if (d.name.length < 2) { state.gymMsg = 'Enter the gym name.'; render(); return }
  if (d.address.length < 4) { state.gymMsg = 'Enter the street address.'; render(); return }
  if (d.city.length < 2) { state.gymMsg = 'Enter the city.'; render(); return }
  state.gymBusy = true
  state.gymMsg = 'Looking up that address…'
  render()
  try {
    let point = await geocodeAddress(d.address, d.city, d.state)
    let approx = false
    if (!point) {
      const cities = await ensureCities()
      const city = findCity(cities, d.city, d.state)
      if (!city) throw new Error('Could not find that city. Check the spelling and the state.')
      point = { lat: city.lat, lng: city.lng }
      approx = true
    }
    const { data, error } = await supabase.rpc('submit_gym', {
      p_name: d.name, p_address: d.address, p_town: d.city, p_state: d.state,
      p_website: d.website || null, p_lat: point.lat, p_lng: point.lng
    })
    if (error) throw error
    state.gymBusy = false
    state.gymDraft = blankGym()
    state.gymMsg = ''
    await loadGyms()
    const outcome = data && data.outcome
    if (outcome === 'created' || outcome === 'already_yours') {
      toast(approx ? 'Gym saved. The pin is the center of the city because the street was not found. Only you can see it until it is approved or confirmed by ' + CONFIRMATIONS_REQUIRED + ' boxers.' : 'Gym saved. Only you can see it until it is approved or confirmed by ' + CONFIRMATIONS_REQUIRED + ' boxers.')
    } else if (outcome === 'already_listed') toast('That gym is already listed.')
    else if (outcome === 'confirmed' || outcome === 'already_confirmed') {
      const n = data.confirmation_count || 0
      toast(data.visible ? 'This gym is now listed for everyone.' : 'Confirmation saved. ' + n + ' of ' + CONFIRMATIONS_REQUIRED + ' so far.')
    } else toast('Gym saved.')
    state.sheet = false
    render()
  } catch (e) {
    state.gymBusy = false
    state.gymMsg = errText(e)
    render()
  }
}
async function onPhoto(file) {
  if (!file) return
  if (file.type && file.type.indexOf('image/') !== 0) { state.picErr = 'Choose a JPG or PNG.'; render(); return }
  if (file.size > 8e6) { state.picErr = 'That photo is over 8 MB. Choose a smaller one.'; render(); return }
  state.picBusy = true
  state.picErr = ''
  render()
  try {
    const blob = await resizeImage(file)
    const path = uid() + '/avatar.jpg'
    let up = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
    let used = path
    if (up.error) {
      used = uid() + '/avatar-' + Date.now() + '.jpg'
      up = await supabase.storage.from('avatars').upload(used, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
    }
    if (up.error) throw up.error
    const pub = supabase.storage.from('avatars').getPublicUrl(used)
    state.me.avatar_url = pub.data.publicUrl + '?v=' + Date.now()
    state.picBusy = false
    const ok = await saveProfile()
    if (ok) toast('Photo updated')
    render()
  } catch (e) {
    state.picBusy = false
    state.picErr = errText(e)
    render()
  }
}
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.onload = () => {
      const im = new Image()
      im.onload = () => {
        const c = document.createElement('canvas')
        const k = Math.min(1, 480 / Math.max(im.width, im.height))
        c.width = Math.max(1, Math.round(im.width * k))
        c.height = Math.max(1, Math.round(im.height * k))
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
        c.toBlob(b => b ? resolve(b) : reject(new Error('Could not save that photo.')), 'image/jpeg', 0.8)
      }
      im.onerror = () => reject(new Error('That file could not be read as a photo.'))
      im.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
async function removePhoto() {
  state.me.avatar_url = ''
  const ok = await saveProfile()
  if (ok) toast('Photo removed')
  render()
}
async function exportProfile() {
  const { data, error } = await supabase.from('profiles').select('id,display_name,age,height,town,lat,lng,weight_class,experience,stance,intensity,goal,gloves,availability_days,availability_times,home_gym_id,bio,avatar_url,adult_confirmed,terms_accepted_at,safety_acknowledged_at,created_at,updated_at').eq('id', uid()).single()
  if (error) { toast(errText(error), 'err'); return }
  const file = { exported_at: new Date().toISOString(), email: (state.session.user && state.session.user.email) || null, profile: data }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'boxing-buddies-profile.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  toast('Profile download started')
}
async function deleteAccount() {
  const id = uid()
  const listed = await supabase.storage.from('avatars').list(id)
  if (listed.error) { toast(errText(listed.error), 'err'); return }
  const paths = (listed.data || []).filter(f => f.name && f.id).map(f => id + '/' + f.name)
  if (paths.length) {
    const removed = await supabase.storage.from('avatars').remove(paths)
    if (removed.error) { toast(errText(removed.error), 'err'); return }
  }
  const { error } = await supabase.rpc('delete_own_account')
  if (error) { toast(errText(error), 'err'); return }
  try { await supabase.auth.signOut() } catch (e) {}
  resetUser()
  state.session = null
  state.booting = false
  render()
  toast('Account deleted')
}
async function invite() {
  const url = location.origin + location.pathname
  const text = 'Find a sparring partner on Boxing Buddies'
  if (navigator.share) {
    try { await navigator.share({ title: 'Boxing Buddies', text, url }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied') }
  catch (e) { toast(url) }
}
async function finishOnboarding() {
  if (state.saving) return
  if (!state.agreeAdult) { toast('Confirm that you are 18 or older.', 'err'); return }
  if (!state.agreeTerms) { toast('Agree to the Terms and Privacy Policy to continue.', 'err'); return }
  state.me.adultConfirmed = true
  state.me.termsAcceptedAt = new Date().toISOString()
  const problem = validateProfile(payload(), true)
  if (problem) { toast(problem, 'err'); return }
  state.saving = true
  render()
  const ok = await saveProfile()
  state.saving = false
  if (!ok) { render(); return }
  state.onb = 0
  state.tab = 'discover'
  await Promise.all([loadGyms(), loadDeck(), loadMatches()])
  toast('Profile saved')
  render()
}

function avHtml(p, sz) {
  const inner = p.avatar_url ? '<img alt="" src="' + esc(p.avatar_url) + '" style="width:100%;height:100%;object-fit:cover">' : esc(ini(p))
  return '<span class="av' + (sz ? ' ' + sz : '') + '" style="--art:' + col(p) + '">' + inner + '</span>'
}
function meAv(sm) {
  if (state.picBusy && !sm) return '<i class="pav skeleton" role="img" aria-label="Loading photo"></i>'
  const inner = state.me.avatar_url ? '<img alt="" src="' + esc(state.me.avatar_url) + '">' : (state.me.n ? esc(state.me.n[0].toUpperCase()) : '')
  return '<i class="pav' + (sm ? ' sm' : '') + '">' + inner + '</i>'
}
function photoBits(p) {
  const img = p.avatar_url ? '<img class="ph" alt="" src="' + esc(p.avatar_url) + '">' : ''
  return '<span class="ghost" aria-hidden="true">' + esc(ini(p)) + '</span>' + img
}
function card(p, back) {
  const c = compat(state.me, p)
  const free = dayStr(p.dy, []).split(' · ')[0]
  return '<div class="card' + (back ? ' back' : '') + '" data-id="' + esc(p.id) + '"><div class="photo" style="--art:' + col(p) + '">' + photoBits(p) +
    '<span class="tint s"></span><span class="tint p"></span><span class="fit' + (c.score >= 80 ? ' hi' : ' soft') + '">' + c.label + '</span>' +
    (p.v ? '<span class="ver">Verified</span>' : '') + '<span class="stamp s">SPAR</span><span class="stamp p">PASS</span><div class="who"><div class="wh"><h2>' + esc(p.n) + ' <small>' + esc(p.a) + '</small></h2><p>' + esc(p.exp) + ' · ' + esc(p.w) + '</p></div></div></div><div class="info"><div class="line"><b>' + esc(p.gym) + '</b><span>' + (typeof p.d === 'number' ? dist(p.d) : '') + '</span></div><div class="fitrow"><span>Compatibility</span><b>' + c.score + '%</b></div><div class="fbar" role="img" aria-label="Compatibility ' + c.score + ' percent"><i style="width:' + c.score + '%"></i></div>' +
    cmpStrip(p) + '<p class="quote"><span class="cap">Looking for</span>' + esc(p.bio || p.gl || 'A training partner') + '</p><dl class="facts"><div><dt>Intensity</dt><dd>' + esc(p.int || '—') + '</dd></div><div><dt>Free</dt><dd>' + esc(free) + '</dd></div><div><dt>Time</dt><dd>' + esc((p.tm || []).join(' / ') || '—') + '</dd></div></dl></div></div>'
}
function cmpStrip(p) {
  return '<ul class="cmp" aria-label="Compatibility">' + compat(state.me, p).rows.slice(0, 5).map(x => '<li class="s-' + x.s + '"><i aria-hidden="true"></i>' + x.k + '<span class="vh"> (' + STW[x.s] + ')</span></li>').join('') + '</ul>'
}
function discover() {
  if (state.loadingDeck) return '<div class="empty"><div class="spinner" role="status" aria-label="Loading"></div><p>Finding boxers near ' + esc(locLabel()) + '.</p></div>'
  if (!state.hasProfile) return '<div class="empty">' + emptyArt() + '<h2>Finish your profile</h2><p>Add your name, age, and a US location so other boxers can find you.</p><button class="btn" data-act="edit">Set up profile</button></div>'
  if (!state.cfg.loc) return '<div class="empty">' + emptyArt() + '<h2>Set your location</h2><p>Search any US city or ZIP, or use your current location. Boxers and gyms are sorted by distance from there.</p><button class="btn" data-act="loc">Choose a location</button></div>'
  const q = pool()
  const blocked = new Set(state.blocks.map(b => b.id))
  const inRadius = state.profiles.filter(p => !blocked.has(p.id) && typeof p.d === 'number' && p.d <= state.cfg.maxd)
  const unseen = inRadius.filter(p => !state.swiped.has(p.id))
  if (!q.length && !inRadius.length) {
    return '<div class="disc"><div class="empty">' + emptyArt() + '<h2>No boxers near you yet</h2><p>Invite friends to Boxing Buddies. The more people nearby, the sooner you will have someone to spar.</p><div class="btn-row"><button class="btn" data-act="invite">Invite friends</button><button class="btn btn-sec" data-act="loc">Change location</button></div></div></div>'
  }
  if (!q.length && !unseen.length) {
    return '<div class="disc"><div class="empty">' + emptyArt() + '<h2>You have seen everyone nearby</h2><p>Check back as more boxers join, or invite friends and widen your radius.</p><div class="btn-row"><button class="btn" data-act="invite">Invite friends</button><button class="btn btn-sec" data-act="loc">Change location</button></div></div></div>'
  }
  if (!q.length) {
    return '<div class="disc"><div class="empty">' + emptyArt() + '<h2>No boxers match these filters</h2><p>Clear a filter or widen the distance to see more training partners.</p><div class="btn-row"><button class="btn btn-sec" data-act="filters">Open filters</button><button class="btn" data-act="fclear">Reset filters</button></div></div></div>'
  }
  const any = state.filters.w !== 'All' || state.filters.e !== 'All' || state.filters.i !== 'All' || state.filters.g !== 'All' || state.filters.dy.length
  const chip = (label, on) => '<button class="chip" data-act="filters" aria-pressed="' + on + '">' + esc(label) + '</button>'
  return '<div class="disc"><div class="qf" role="group" aria-label="Quick filters"><button class="chip fchip" data-act="filters">Filters</button><button class="chip" data-act="fclear" aria-pressed="' + (!any) + '">All</button>' +
    chip(state.filters.w === 'All' ? 'Weight' : state.filters.w, state.filters.w !== 'All') + chip(state.filters.e === 'All' ? 'Experience' : state.filters.e, state.filters.e !== 'All') +
    '</div><div class="seg" role="group" aria-label="Sort"><button data-act="sort" data-v="fit" aria-pressed="' + (state.cfg.sort !== 'near') + '">Best fit</button><button data-act="sort" data-v="near" aria-pressed="' + (state.cfg.sort === 'near') + '">Nearest</button></div>' +
    '<div class="stack">' + (q[1] ? card(q[1], true) : '') + card(q[0]) + '</div><div class="actions"><button class="ibtn lg" data-act="pass" aria-label="Pass"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg><span>Pass</span></button><button class="ibtn lg pri" data-act="spar" aria-label="Spar"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>Spar</span></button></div></div>'
}
function gymsView() {
  const list = nearbyGyms().filter(g => g.mi == null || g.mi <= state.cfg.maxd || g.submitted_by === uid())
  const mine = list.filter(g => g.submitted_by === uid() && g.status !== 'approved')
  const shown = list.filter(g => g.status === 'approved' || g.status == null || g.submitted_by === uid())
  const cards = shown.map(g => {
    const pending = g.status === 'pending'
    const site = safeHttps(g.website || '')
    const addr = [g.address, g.town, g.state].filter(Boolean).join(', ')
    return '<div class="box pad gym-row"><div><h3>' + esc(g.name) + (pending ? ' <span class="tag-pending">Pending</span>' : '') + '</h3><p class="meta">' + esc(addr) + '</p><p class="meta">' + (g.mi != null ? 'About ' + dist(g.mi) + ' away' : 'Distance unavailable') + (pending ? ' · ' + (g.confirmation_count || 0) + ' of ' + CONFIRMATIONS_REQUIRED + ' confirmations' : '') + '</p></div><div class="pbtns">' +
      '<a class="btn btn-sec btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(g.name + ' ' + addr) + '">Directions</a>' +
      (site ? '<a class="btn btn-sec btn-sm" target="_blank" rel="noopener" href="' + esc(site) + '">Website</a>' : '') +
      '</div></div>'
  }).join('')
  return sessionCards() + '<div class="evh"><p class="meta">Gyms near ' + esc(locLabel()) + '</p><button class="btn btn-sm" data-act="addgym">Add a gym</button></div>' +
    (state.cfg.loc ? '' : '<p class="help">Set a location to sort gyms by distance.</p>') +
    (shown.length ? cards : '<div class="box pad"><p class="meta">No gyms within ' + dist(state.cfg.maxd) + ' of ' + esc(locLabel()) + ' yet.</p><p class="help">Add the gym where you train. You will see it immediately. Everyone else sees it after the owner approves it or ' + CONFIRMATIONS_REQUIRED + ' other boxers confirm the same gym.</p></div>') +
    (mine.length ? '' : '') +
    '<p class="note">Check with each gym for sparring rules and class times. Address lookup for new gyms uses OpenStreetMap.</p>'
}
function sessionCards() {
  const rows = state.sessions.filter(s => s.status === 'proposed' || s.status === 'accepted')
  if (!rows.length) return '<p class="eyebrow">Sessions</p><p class="meta">When you match someone, propose a time from the chat. It shows up here.</p>'
  return '<p class="eyebrow">Sessions</p><div class="box">' + rows.map(s => {
    const m = matchById(s.match_id)
    const who = m ? m.partner.n : 'Your match'
    const where = (s.gyms && s.gyms.name) || 'Gym to confirm'
    const mine = s.proposer_id === uid()
    const when = new Date(s.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    return '<div class="srow col sessr"><div class="sr1"><b>' + esc(who) + '</b><span class="tagi">' + esc(s.status) + '</span></div><p class="meta">' + esc(when) + ' at ' + esc(where) + '</p>' +
      (s.note ? '<p class="meta">' + esc(s.note) + '</p>' : '') +
      '<div class="row-gap"><button class="btn btn-sm btn-sec" data-act="ics" data-v="' + s.id + '">Add to calendar</button>' +
      (!mine && s.status === 'proposed' ? '<button class="btn btn-sm" data-act="accept" data-v="' + s.id + '">Accept</button><button class="btn btn-sm btn-sec" data-act="decline" data-v="' + s.id + '">Decline</button>' : '') +
      '<button class="btn btn-sm btn-ghost" data-act="cancel-session" data-v="' + s.id + '">Cancel</button></div></div>'
  }).join('') + '</div>'
}
function fieldHtml(k, label, type, ph) {
  const val = state.me[k] == null ? '' : state.me[k]
  const extra = k === 'bio' ? ' maxlength="500"' : k === 'n' ? ' maxlength="60"' : k === 'a' ? ' min="18" max="100" inputmode="numeric"' : ''
  return '<label class="field">' + label + '<input class="input" data-f="' + k + '" value="' + esc(val) + '" type="' + (type || 'text') + '" placeholder="' + esc(ph || label) + '"' + extra + '></label>'
}
function consentFields() {
  return '<label class="srow rad"><input id="age18" type="checkbox"' + (state.agreeAdult ? ' checked' : '') + '><span>I confirm I am 18 or older</span></label>' +
    '<label class="srow rad"><input id="termsok" type="checkbox"' + (state.agreeTerms ? ' checked' : '') + '><span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a></span></label>' +
    '<p class="help">The Terms say Boxing Buddies is for US residents only. Both documents are drafts and still need a lawyer’s review.</p>'
}
function chipGroup(k, label, opts) {
  return '<div class="field"><span class="field-l" id="lb' + k + '">' + label + '</span><div class="chips" role="radiogroup" aria-labelledby="lb' + k + '">' + opts.map(x => {
    const on = state.me[k] === x
    return '<button class="chip" role="radio" aria-checked="' + on + '" data-act="pf" data-k="' + k + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'
  }).join('') + '</div></div>'
}
function multi(k, label, opts, sel) {
  return '<div class="field"><span class="field-l">' + label + '</span><div class="chips" role="group">' + opts.map(x => {
    const on = (sel || []).indexOf(x) >= 0
    return '<button class="chip" aria-pressed="' + on + '" data-act="' + k + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'
  }).join('') + '</div></div>'
}
function gymPicker() {
  const rows = nearbyGyms().slice(0, 40)
  if (state.me.gymId && !rows.some(g => String(g.id) === String(state.me.gymId))) {
    const own = state.gyms.find(g => String(g.id) === String(state.me.gymId))
    if (own) rows.unshift(own)
  }
  const none = !state.me.gymId
  return '<div class="box" role="radiogroup" aria-label="Home gym"><button class="srow opt" data-act="gym" data-v="" aria-checked="' + none + '"><span>No home gym yet</span>' + (none ? '<span class="chk">&#10003;</span>' : '') + '</button>' +
    rows.map(g => {
      const on = String(g.id) === String(state.me.gymId)
      const extra = g.status === 'pending' ? ' (pending)' : ''
      return '<button class="srow opt" data-act="gym" data-v="' + g.id + '" aria-checked="' + on + '"><span>' + esc(g.name + extra) + (g.mi ? ' · ' + dist(g.mi) : '') + '</span>' + (on ? '<span class="chk">&#10003;</span>' : '') + '</button>'
    }).join('') + '</div>' +
    (state.hasProfile ? '<button class="btn btn-sec btn-block mt-3" data-act="addgym">Add a gym</button>' : '<p class="help">You can add a missing gym after your profile is saved.</p>')
}
function meView() {
  const bits = [state.me.n, state.me.a, state.me.avatar_url, state.me.bio, (state.me.dy || []).length]
  const p = bits.filter(Boolean).length * 20
  return '<div class="psum">' + meAv() + '<div><h2>' + esc(state.me.n || 'Your profile') + (state.me.v ? ' <span class="ver">Verified</span>' : '') + '</h2><p class="meta">' + esc(state.me.w) + ' · ' + esc(state.me.exp) + ' · ' + esc(state.me.st) + '</p><div class="pbtns"><label class="btn btn-sm btn-sec filebtn">' + (state.me.avatar_url ? 'Change photo' : 'Add photo') + '<input type="file" id="pic" accept="image/*" aria-label="Choose a profile photo"></label>' +
    (state.me.avatar_url ? '<button class="btn btn-sm btn-ghost" data-act="rmpic">Remove</button>' : '') + '</div></div></div>' +
    (state.picErr ? '<p class="field-err" role="alert">' + esc(state.picErr) + '</p>' : '') +
    '<div class="meter"><p class="meta"><b>' + (p < 100 ? p + '% complete' : 'Profile complete') + '</b></p><div class="bar" style="--p:' + p + '%"><i></i></div></div>' +
    '<p class="eyebrow">About you</p><div class="box pad">' + fieldHtml('n', 'Name') + fieldHtml('a', 'Age', 'number') + fieldHtml('h', 'Height', 'text', 'e.g. 5 ft 10') + '</div>' +
    '<p class="eyebrow">Your boxing</p><div class="box pad">' + chipGroup('w', 'Weight class', W.slice(1)) + chipGroup('exp', 'Experience', E.slice(1)) + chipGroup('st', 'Stance', ['Orthodox', 'Southpaw']) + '</div>' +
    '<p class="eyebrow">Home gym</p>' + gymPicker() +
    '<p class="eyebrow">Sparring preferences</p><div class="box pad">' + chipGroup('int', 'Sparring intensity', INT) + '<p class="help">' + INTHELP[state.me.int] + '</p>' + chipGroup('gl', 'Main goal', GOALS) + multi('pd', 'Days you can spar', DAYS, state.me.dy) + multi('pt', 'Time of day', TIMES, state.me.tm) + fieldHtml('bio', 'Anything else partners should know', 'text', 'e.g. Coming back from a layoff') + fieldHtml('gloves', 'Gloves', 'text', 'e.g. 16 oz') + '</div>' +
    '<p class="note">Saved to your account. A verified badge is added by Boxing Buddies after a manual check.</p>'
}
function onbView() {
  const email = state.session.user.email || ''
  const top = '<div class="onb-top"><button class="ibtn" data-act="oback" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' + markSvg() + '<button class="btn btn-ghost btn-sm" data-act="signout">Sign out</button></div><div class="steps" role="img" aria-label="Step ' + Math.min(state.onb, 2) + ' of 2"><i class="' + (state.onb >= 1 ? 'on' : '') + '"></i><i class="' + (state.onb >= 2 ? 'on' : '') + '"></i></div>'
  if (state.onb === 1) {
    return '<div class="onb">' + top + '<div class="onb-body"><h1>How do you box?</h1><p>Signed in as ' + esc(email) + '. This is how partners see you. You can change it any time.</p>' +
      fieldHtml('n', 'Your name') + fieldHtml('a', 'Age', 'number', '18 or older') + chipGroup('w', 'Weight class', W.slice(1)) + chipGroup('exp', 'Experience', E.slice(1)) + chipGroup('st', 'Stance', ['Orthodox', 'Southpaw']) + chipGroup('int', 'Sparring intensity', INT) + '<p class="help">' + INTHELP[state.me.int] + '</p>' + chipGroup('gl', 'Main goal', GOALS) +
      '</div><div class="onb-cta"><button class="btn btn-block" data-act="onext">Continue</button></div></div>'
  }
  if (state.onb === 3) {
    return '<div class="onb">' + top + '<div class="onb-body"><h1>Before you continue</h1><p>Boxing Buddies is for US residents who are 18 or older. Confirm your age and agree to the Terms and Privacy Policy.</p>' + fieldHtml('a', 'Age', 'number', '18 or older') + consentFields() +
      '</div><div class="onb-cta"><button class="btn btn-block' + (state.saving ? ' is-loading' : '') + '" data-act="odone"' + (state.saving ? ' disabled' : '') + '>Continue</button></div></div>'
  }
  return '<div class="onb">' + top + '<div class="onb-body"><h1>Where do you train?</h1><p>Pick a city or ZIP anywhere in the US, or use your location. Closer boxers rank higher.</p>' + consentFields() + '<p class="field-l mt-3">Your location</p><div class="box"><button class="srow link" data-act="loc"><div><b>' + esc(state.cfg.loc ? state.cfg.loc.name : 'Choose a city or ZIP') + '</b><span>Within ' + dist(state.cfg.maxd) + '</span></div></button></div><p class="field-l mt-3">Home gym</p>' + gymPicker() + multi('pd', 'Days you can spar', DAYS, state.me.dy) + multi('pt', 'Time of day', TIMES, state.me.tm) +
    '</div><div class="onb-cta"><button class="btn btn-block' + (state.saving ? ' is-loading' : '') + '" data-act="odone"' + (state.saving ? ' disabled' : '') + '>Start sparring</button></div></div>'
}
function authView() {
  const urlErr = authErrorFromUrl()
  if (state.authSent) {
    return '<div class="onb welcome"><div class="onb-art hero" aria-hidden="true"><div class="brand">' + markSvg() + '<span class="bn">Boxing<br>Buddies</span></div></div><div class="onb-body"><h1>Check your email.</h1><p>We sent a sign-in link to <b>' + esc(state.authEmail) + '</b>. Open it on this device.</p><label class="field">Email code<input id="code" class="input" inputmode="numeric" autocomplete="one-time-code" placeholder="If the email has a code"></label>' +
      (state.authMsg ? '<p class="' + (state.authErr ? 'field-err' : 'help') + '" role="status">' + esc(state.authMsg) + '</p>' : '<p class="help">The link signs you in. A code works too, when the email includes one.</p>') +
      '</div><div class="onb-cta"><button class="btn btn-block' + (state.authBusy ? ' is-loading' : '') + '" data-act="verify">Continue</button><button class="btn btn-sec btn-block" data-act="auth-reset">Use a different email</button></div></div>'
  }
  return '<div class="onb welcome"><div class="onb-art hero" aria-hidden="true"><div class="brand">' + markSvg() + '<span class="bn">Boxing<br>Buddies</span></div></div><div class="onb-body"><h1>Find your next sparring partner.</h1><p>Match with boxers near you, then plan a session at a real gym. Anywhere in the US.</p><label class="field">Email<input id="email" class="input" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" value="' + esc(state.authEmail) + '"></label>' +
    ((state.authMsg || urlErr) ? '<p class="field-err" role="alert">' + esc(state.authMsg || urlErr) + '</p>' : '<p class="fine">We email you a sign-in link. No password to remember.</p>') +
    '</div><div class="onb-cta"><button class="btn btn-block' + (state.authBusy ? ' is-loading' : '') + '" data-act="magic">Email me a link</button><button class="btn btn-sec btn-block" data-act="google">Continue with Google</button></div></div>'
}
function authErrorFromUrl() {
  const q = new URLSearchParams(location.search)
  const h = new URLSearchParams((location.hash || '').replace(/^#/, ''))
  return q.get('error_description') || h.get('error_description') || ''
}
function ago(ts) {
  if (!ts) return ''
  const m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000))
  if (m < 1) return 'now'
  if (m < 60) return m + 'm'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h'
  return Math.round(h / 24) + 'd'
}
function convoRows() {
  if (!state.matches.length) return '<div class="empty">' + emptyArt('bag') + '<h2>No messages yet</h2><p>Swipe spar on boxers you would train with. When they spar you back, you can message them here.</p><button class="btn" data-act="tab" data-v="discover">Start swiping</button></div>'
  const q = state.msgQ.trim().toLowerCase()
  const rows = state.matches.filter(m => !q || m.partner.n.toLowerCase().indexOf(q) >= 0).slice().sort((a, b) => {
    const la = msgs(a.id).slice(-1)[0]
    const lb = msgs(b.id).slice(-1)[0]
    return new Date((lb && lb.created_at) || b.created_at) - new Date((la && la.created_at) || a.created_at)
  })
  if (!rows.length) return '<div class="nores"><b>No boxers found</b><p>Try another name.</p></div>'
  return rows.map(m => {
    const last = msgs(m.id).slice(-1)[0]
    const un = state.unread[String(m.id)]
    const mine = last && last.sender_id === uid()
    return '<button class="dm' + (un ? ' un' : '') + '" data-act="chat" data-v="' + m.id + '">' + avHtml(m.partner) + '<span class="dmt"><b>' + esc(m.partner.n) + '</b><span class="pv">' + (mine ? 'You: ' : '') + esc(last ? last.body : 'New match') + '</span></span><span class="dmr"><span class="tm">' + ago(last && last.created_at) + '</span>' + (un ? '<i class="ud" aria-label="Unread"></i>' : '') + '</span></button>'
  }).join('')
}
function matchList() {
  const fresh = state.matches.filter(m => !msgs(m.id).some(msg => msg.sender_id === uid()))
  const story = fresh.length ? '<p class="eyebrow">New matches</p><div class="story">' + fresh.map(m => '<button class="st" data-act="chat" data-v="' + m.id + '"><span class="ring' + (state.unread[String(m.id)] ? ' on' : '') + '">' + avHtml(m.partner, 'lg') + '</span><span>' + esc(m.partner.n.split(' ')[0]) + '</span></button>').join('') + '</div>' : ''
  return '<label class="sq"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="msq" placeholder="Search conversations" aria-label="Search messages" value="' + esc(state.msgQ) + '"></label>' + story +
    (state.matches.length ? '<h2 class="eyebrow">Recent messages</h2>' : '') + '<div id="mlist">' + convoRows() + '</div>' + sessionCards()
}
function chatView() {
  const m = matchById(state.openMatch)
  if (!m) return matchList()
  const p = m.partner
  const list = msgs(m.id)
  let html = '<div class="ch"><button class="ibtn" data-act="back" aria-label="Back to messages"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' + avHtml(p, 'sm') + '<span class="cht"><b>' + esc(p.n) + '</b><span>' + esc(p.gym) + '</span></span><button class="ibtn" data-act="plan" aria-label="Plan a session"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg></button></div>' +
    '<div class="btn-row mb-2"><button class="btn btn-sec" data-act="report" data-v="' + esc(p.id) + '">Report</button><button class="btn btn-danger" data-act="block" data-v="' + esc(p.id) + '">Block</button></div>'
  html += '<div class="chat"><div class="msgs" id="msgs">'
  list.forEach((msg, i) => {
    const prev = list[i - 1]
    if (!prev || new Date(msg.created_at) - new Date(prev.created_at) > 3 * 3600 * 1000) {
      html += '<p class="tsl">' + esc(new Date(msg.created_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</p>'
    }
    if (msg.sender_id === uid()) html += '<div class="mr me"><div class="m me">' + esc(msg.body) + '</div></div>'
    else html += '<div class="mr">' + avHtml(p, 'xs') + '<div class="m">' + esc(msg.body) + '</div></div>'
  })
  if (!list.length) html += '<p class="tsl">Say hello and pick a gym.</p>'
  const quick = list.some(msg => msg.sender_id === uid()) ? '' : '<div class="chips quick">' + ['Which gym works for you?', 'Free Tuesday at 7?', 'Technical pace, light contact?'].map(t => '<button class="chip" data-act="quick" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>'
  return html + '</div>' + quick + '<div class="send"><input id="txt" class="input" placeholder="Message" aria-label="Message" maxlength="2000" value="' + esc(state.msgDraft) + '"><button class="btn" id="send" data-act="send"' + (state.msgDraft.trim() ? '' : ' disabled') + '>Send</button></div></div>'
}
function filtersView() {
  const chips = (act, opts, val, all) => '<div class="chips">' + opts.map(x => '<button class="chip" data-act="' + act + '" data-v="' + esc(x) + '" aria-pressed="' + (x === val) + '">' + esc(x === 'All' ? all : x) + '</button>').join('') + '</div>'
  const n = pool().length
  return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button><h2 class="big">Filters</h2><p class="eyebrow">Weight class</p><div class="box"><div class="srow col">' + chips('fw', W, state.filters.w, 'All weights') + '</div></div><p class="eyebrow">Experience</p><div class="box"><div class="srow col">' + chips('fe', E, state.filters.e, 'All levels') + '</div></div><p class="eyebrow">Intensity</p><div class="box"><div class="srow col">' + chips('fi', ['All'].concat(INT), state.filters.i, 'Any intensity') + '</div></div><p class="eyebrow">Goal</p><div class="box"><div class="srow col">' + chips('fg', ['All'].concat(GOALS), state.filters.g, 'Any goal') + '</div></div><p class="eyebrow">Available on</p><div class="box"><div class="srow col"><div class="chips">' + DAYS.map(d => '<button class="chip" data-act="fd" data-v="' + d + '" aria-pressed="' + (state.filters.dy.indexOf(d) >= 0) + '">' + d + '</button>').join('') + '</div></div></div>' +
    '<p class="eyebrow">Location</p><div class="box"><button class="srow link" data-act="loc"><div><b>' + esc(state.cfg.loc ? state.cfg.loc.name : 'Not set') + '</b><span>Within ' + dist(state.cfg.maxd) + '</span></div></button></div>' +
    '<p class="eyebrow">Radius</p><div class="box"><div class="srow col"><b>Within <em id="dv">' + dist(state.cfg.maxd) + '</em></b><input type="range" min="5" max="200" step="5" value="' + state.cfg.maxd + '" data-act="maxd" aria-label="Search radius"></div></div>' +
    '<button class="btn btn-sec btn-block mt-4" data-act="fclear">Clear filters</button><button class="btn btn-block mt-2" data-act="close">' + (n ? 'Show ' + n + ' boxer' + (n === 1 ? '' : 's') : 'No boxers match') + '</button>'
}
function settingsView() {
  const seg = (k, opts) => '<div class="seg">' + opts.map(x => '<button data-act="cfg" data-k="' + k + '" data-v="' + x[0] + '"' + (String(state.cfg[k]) === x[0] ? ' aria-pressed="true"' : '') + '>' + x[1] + '</button>').join('') + '</div>'
  const tog = (k, label, sub) => '<div class="srow"><div><b>' + label + '</b><span>' + sub + '</span></div><button class="sw" role="switch" aria-checked="' + !!state.cfg[k] + '" aria-label="' + label + '" data-act="toggle" data-k="' + k + '"></button></div>'
  const email = state.session.user.email || ''
  return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button><h2 class="big">Settings</h2><div class="box mt-3"><button class="srow link" data-act="edit"><span class="who-row">' + meAv(true) + esc(state.me.n || 'Set up your profile') + '</span></button></div>' +
    '<p class="eyebrow">Discovery</p><div class="box"><button class="srow link" data-act="loc"><div><b>Location</b><span>' + esc(state.cfg.loc ? state.cfg.loc.name : 'Not set') + '</span></div></button><div class="srow col"><b>Radius: <em id="dv">' + dist(state.cfg.maxd) + '</em></b><input type="range" min="5" max="200" step="5" value="' + state.cfg.maxd + '" data-act="maxd" aria-label="Search radius"></div>' +
    tog('verified', 'Verified boxers only', 'Hide profiles that are not verified') + '<div class="srow col"><b>Distance units</b>' + seg('units', [['mi', 'Miles'], ['km', 'Kilometers']]) + '</div><div class="srow col"><b>Sort discover</b>' + seg('sort', [['fit', 'Best fit'], ['near', 'Nearest']]) + '</div></div>' +
    '<p class="eyebrow">Appearance</p><div class="box"><div class="srow col"><b>Theme</b>' + seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) + '</div></div>' +
    '<p class="eyebrow">Notifications</p><div class="box">' + tog('nMatch', 'Match pop-ups', 'Show a pop-up when someone matches you') + tog('nMsg', 'Message toasts', 'A short note when a new message arrives') + '</div>' +
    '<p class="eyebrow">Safety</p><div class="box"><button class="srow link" data-act="safety"><div><b>Safety guide</b><span>Gym, gear, and tell someone before a first session</span></div></button></div>' +
    (state.blocks.length ? '<p class="eyebrow">Blocked (' + state.blocks.length + ')</p><div class="box">' + state.blocks.map(b => '<div class="srow"><span>' + esc(b.name) + '</span><button class="btn btn-sm btn-sec" data-act="unblock" data-v="' + b.id + '">Unblock</button></div>').join('') + '</div>' : '') +
    '<p class="eyebrow">Your data</p><div class="box"><button class="srow link" data-act="export">Download my profile</button><button class="srow link" data-act="delete-account" style="color:var(--err)">Delete account</button></div>' +
    '<p class="eyebrow">Legal</p><div class="box"><a class="srow link" href="privacy.html">Privacy Policy</a><a class="srow link" href="terms.html">Terms of Service</a></div><p class="help">The Terms say Boxing Buddies is for US residents only. Both pages are drafts pending a lawyer’s review.</p>' +
    '<p class="eyebrow">Account</p><div class="box"><div class="srow"><div><b>Signed in</b><span>' + esc(email) + '</span></div></div><button class="srow link" data-act="signout">Sign out</button></div>' +
    '<p class="eyebrow">About</p><div class="box"><div class="srow"><b>Version</b><span>1.1 beta</span></div><div class="srow"><div><b>Nationwide</b><span>Search any US city or ZIP. Gyms you add stay private until they are approved or confirmed.</span></div></div></div>'
}
function locationView() {
  return '<button class="btn btn-sec btn-sm sheet-done" data-act="locback">Done</button><h2 class="big">Location</h2><p class="meta mt-2">Current: <b>' + esc(state.cfg.loc ? state.cfg.loc.name : 'Not set') + '</b></p>' +
    '<button class="btn btn-sec btn-block mt-3' + (state.locBusy ? ' is-loading' : '') + '" data-act="locgps"' + (state.locBusy ? ' disabled' : '') + '>' + (state.locBusy ? 'Finding you' : 'Use my current location') + '</button>' +
    '<p class="' + (state.locMsgErr ? 'field-err' : 'help') + '" role="status">' + esc(state.locMsg) + '</p>' +
    '<p class="eyebrow">Radius</p><div class="box"><div class="srow col"><b>Within <em id="dv">' + dist(state.cfg.maxd) + '</em></b><input type="range" min="5" max="200" step="5" value="' + state.cfg.maxd + '" data-act="maxd" aria-label="Search radius"></div></div>' +
    '<p class="eyebrow">City or ZIP</p><label class="sq"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="locq" placeholder="Austin, TX or 78701" aria-label="Search a US city or ZIP" autocomplete="off" value="' + esc(state.locQ) + '"></label>' +
    '<div class="box" id="loclist" role="listbox">' + (state.locQ ? '<p class="note">Searching…</p>' : '<p class="note">All 50 states and Washington, DC. ZIP codes need a connection.</p>') + '</div>' +
    '<p class="note">Distances are straight-line miles from the point you pick. City coordinates are stored on this device. ZIP lookup uses Zippopotam.</p>'
}
function planView() {
  const m = matchById(state.openMatch)
  if (!m) return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button>'
  const p = m.partner
  const built = slotOptions(p)
  const gyms = gymChoices(p)
  const di = Math.min(Math.max(0, INT.indexOf(state.me.int)), Math.max(0, INT.indexOf(p.int)))
  return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button><h2 class="big">Plan</h2><p class="meta">With ' + esc(p.n) + '</p>' +
    (built.shared ? '' : '<p class="help">You do not share free days yet. Pick a time, or set your schedule on your profile.</p>') +
    '<label class="field">When<select id="slot" class="input">' + built.slots.map(s => '<option>' + esc(s) + '</option>').join('') + '</select></label>' +
    '<label class="field">Where<select id="splace" class="input">' + gyms.map(g => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('') + '<option value="">Decide the gym in chat</option></select></label>' +
    '<label class="field">Intensity<select id="sint" class="input">' + INT.map((x, i) => '<option' + (i === di ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="field">Note (optional)<input id="snote" class="input" maxlength="200" placeholder="e.g. 4 rounds, bring wraps"></label>' +
    '<button class="btn btn-block mt-3" data-act="book">Send plan</button>' +
    '<div class="chips mt-3"><button class="chip" data-act="safety">Safety tips</button><button class="chip" data-act="report" data-v="' + p.id + '">Report</button><button class="chip" data-act="block" data-v="' + p.id + '" style="color:var(--err)">Block</button></div>'
}
function slotOptions(p) {
  const tmap = { Morning: '8:00am', Afternoon: '1:00pm', Evening: '7:00pm' }
  const slots = []
  ;(state.me.dy || []).forEach(d => {
    if ((p.dy || []).indexOf(d) < 0) return
    const times = (state.me.tm || []).length ? state.me.tm.filter(t => (p.tm || []).indexOf(t) >= 0) : (p.tm || [])
    times.forEach(t => { if (tmap[t]) slots.push(d + ' ' + tmap[t]) })
  })
  const shared = slots.length > 0
  if (!shared) ['Tue 7:00pm', 'Thu 7:00pm', 'Sat 10:00am', 'Sun 11:00am'].forEach(s => slots.push(s))
  return { shared, slots: slots.slice(0, 8) }
}
function gymChoices(p) {
  const out = []
  const add = (g) => { if (g && !out.some(x => String(x.id) === String(g.id))) out.push(g) }
  add(state.gyms.find(g => String(g.id) === String(p.gymId)))
  add(state.gyms.find(g => String(g.id) === String(state.me.gymId)))
  nearbyGyms().slice(0, 8).forEach(add)
  return out
}
function addGymView() {
  const d = state.gymDraft
  if (!d.state) d.state = 'MA'
  return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button><h2 class="big">Add a gym</h2><p class="meta">You will see it right away. Other boxers see it after the owner approves it, or after ' + CONFIRMATIONS_REQUIRED + ' of them add the same gym.</p>' +
    '<label class="field">Name<input id="gname" class="input" maxlength="80" value="' + esc(d.name) + '" placeholder="e.g. Roundhouse Boxing"></label>' +
    '<label class="field">Street address<input id="gaddr" class="input" maxlength="160" value="' + esc(d.address) + '" placeholder="123 Main St"></label>' +
    '<div class="field-row"><label class="field">City<input id="gcity" class="input" maxlength="60" value="' + esc(d.city) + '"></label><label class="field">State<select id="gstate" class="input">' + STATES.map(s => '<option value="' + s[0] + '"' + (s[0] === d.state ? ' selected' : '') + '>' + s[0] + '</option>').join('') + '</select></label></div>' +
    '<label class="field">Website (optional)<input id="gweb" class="input" maxlength="200" value="' + esc(d.website) + '" placeholder="gym.example"></label>' +
    (state.gymMsg ? '<p class="' + (state.gymBusy ? 'help' : 'field-err') + '" role="status">' + esc(state.gymMsg) + '</p>' : '<p class="help">We look up the address once, with OpenStreetMap. Please don’t submit the same gym over and over.</p>') +
    '<button class="btn btn-block mt-4' + (state.gymBusy ? ' is-loading' : '') + '" data-act="gymsave"' + (state.gymBusy ? ' disabled' : '') + '>Save gym</button>'
}
function profileSheet() {
  const p = pool()[0]
  if (!p) return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button>'
  const c = compat(state.me, p)
  return '<button class="btn btn-sec btn-sm sheet-done" data-act="close">Done</button><div class="phero" style="--art:' + col(p) + '">' + photoBits(p) + '<div class="pwho"><h2 class="big">' + esc(p.n) + ' <small>' + esc(p.a) + '</small></h2><p class="meta">' + esc(p.exp) + ', ' + esc(p.w) + (p.v ? ', Verified' : '') + '</p></div></div>' +
    '<div class="stats3"><div><b>' + (typeof p.d === 'number' ? dist(p.d) : '—') + '</b><span>Away</span></div><div><b>' + esc(p.w || '—') + '</b><span>Weight</span></div><div><b>' + c.score + '%</b><span>Fit</span></div></div><p class="fitnote">' + c.label + '</p>' +
    '<p class="eyebrow">Looking for</p><div class="box pad plain"><p class="quote" style="-webkit-line-clamp:unset">' + esc(p.bio || p.gl || 'A training partner') + '</p></div>' +
    '<p class="eyebrow">Compatibility with you</p><div class="box plain">' + c.rows.map(x => '<div class="crow s-' + x.s + '"><span class="ck"><i aria-hidden="true"></i>' + x.k + '</span><span class="cv">' + esc(x.t) + '</span><b>' + STW[x.s] + '</b></div>').join('') + '</div>' +
    (c.warn ? '<p class="warn" role="note"><b>Go easy.</b> You differ a lot in size, experience, or intensity. Start technical and agree before the first round.</p>' : '') +
    '<p class="eyebrow">Details</p><div class="box plain"><div class="srow"><span>Home gym</span><b>' + esc(p.gym) + '</b></div><div class="srow"><span>Stance</span><b>' + esc(p.st || '—') + '</b></div><div class="srow"><span>Height</span><b>' + esc(p.h || '—') + '</b></div><div class="srow"><span>Town</span><b>' + esc(p.town || '—') + '</b></div></div>' +
    '<div class="btn-row mt-4"><button class="btn btn-sec" data-act="pass">Pass</button><button class="btn" data-act="spar">Spar</button></div>' +
    '<div class="btn-row mt-3"><button class="btn btn-sec" data-act="report" data-v="' + esc(p.id) + '">Report</button><button class="btn btn-danger" data-act="block" data-v="' + esc(p.id) + '">Block</button></div>'
}
function personById(id) {
  return state.profiles.find(p => p.id === id) || (state.matches.map(m => m.partner).find(p => p.id === id)) || pool()[0]
}

function renderSheet() {
  const sh = $('#sheet')
  if (!sh) return
  if (!state.sheet) { sh.hidden = true; sh.innerHTML = ''; return }
  const labels = { f: 'Filters', p: 'Boxer profile', l: 'Location', plan: 'Plan a session', gym: 'Add a gym', settings: 'Settings' }
  const body = state.sheet === 'f' ? filtersView() : state.sheet === 'p' ? profileSheet() : state.sheet === 'l' ? locationView() : state.sheet === 'plan' ? planView() : state.sheet === 'gym' ? addGymView() : settingsView()
  sh.hidden = false
  sh.innerHTML = '<div class="scrim" data-act="close"></div><div class="panel in" role="dialog" aria-modal="true" aria-label="' + (labels[state.sheet] || 'Settings') + '">' + body + '</div>'
  if (state.sheet === 'l' && state.locQ) locRows(state.locQ).then(html => { const box = $('#loclist'); if (box) box.innerHTML = html })
}
function render() {
  try { renderApp() } catch (e) { console.error(e); fatal(errText(e)) }
}
function fatal(msg) {
  const m = $('#main')
  if (!m) return
  const h = document.querySelector('header')
  if (h) h.hidden = true
  document.body.classList.add('onb-on')
  m.innerHTML = '<div class="fatal"><h2>Something went wrong</h2><p>' + esc(msg || 'The app hit an unexpected error.') + '</p><button class="btn btn-block" id="fre">Reload</button></div>'
  $('#fre').onclick = () => location.reload()
}
function renderApp() {
  const gate = state.booting || !state.session || state.onb > 0
  document.body.classList.toggle('onb-on', gate)
  const header = document.querySelector('header')
  if (header) header.hidden = gate
  renderSheet()
  const main = $('#main')
  if (state.booting) { main.innerHTML = '<div class="empty"><div class="spinner" role="status" aria-label="Loading"></div><p>Loading Boxing Buddies</p></div>'; return }
  if (!state.session) { main.innerHTML = authView(); document.title = 'Sign in | Boxing Buddies'; bindCards(); return }
  if (state.onb > 0) { main.innerHTML = onbView(); document.title = 'Welcome | Boxing Buddies'; bindCards(); return }
  const titles = { discover: 'Discover', matches: 'Messages', gyms: 'Meetups', me: 'Profile' }
  main.innerHTML = state.tab === 'discover' ? discover() : state.tab === 'gyms' ? gymsView() : state.tab === 'me' ? meView() : (state.openMatch ? chatView() : matchList())
  const n = state.tab === 'discover' ? pool().length : 0
  const unreadN = Object.keys(state.unread).filter(k => state.unread[k]).length
  $('#nav').innerHTML = [['discover', 'Discover'], ['matches', 'Messages'], ['gyms', 'Meetups'], ['me', 'Profile']].map(t => '<button data-act="tab" data-v="' + t[0] + '"' + (state.tab === t[0] ? ' aria-current="true"' : '') + '>' + ICON[t[0]] + '<span>' + t[1] + '</span>' + (t[0] === 'matches' && unreadN ? '<i class="dot">' + unreadN + '</i>' : '') + '</button>').join('')
  $('#ht').textContent = titles[state.tab] || 'Boxing Buddies'
  const sub = $('#hs')
  if (sub) sub.textContent = state.tab === 'discover' && state.cfg.loc ? (n + (n === 1 ? ' boxer' : ' boxers') + ' within ' + dist(state.cfg.maxd) + ' of ' + locLabel()) : (state.tab === 'matches' ? 'Your boxing connections' : '')
  const off = document.getElementById('offline')
  if (off) off.hidden = !state.offline
  document.title = (titles[state.tab] || 'Boxing Buddies') + ' | Boxing Buddies'
  bindCards()
  const ms = $('#msgs')
  if (ms) ms.scrollTop = ms.scrollHeight
}
function bindCards() {
  const top = document.querySelector('.card:not(.back)')
  if (!top) return
  let x0 = 0, dx = 0, on = false, vx = 0, lx = 0, lt = 0
  const bk = document.querySelector('.card.back')
  const reset = () => {
    on = false
    top.classList.remove('drag')
    top.style.transform = ''
    top.style.setProperty('--ts', 0)
    top.style.setProperty('--tp', 0)
    top.querySelectorAll('.stamp').forEach(s => { s.style.opacity = 0 })
    if (bk) bk.style.transform = ''
  }
  top.tabIndex = 0
  top.setAttribute('role', 'group')
  top.onpointerdown = (e) => {
    if (state.deciding || e.button > 0) return
    on = true; x0 = lx = e.clientX; dx = 0; vx = 0; lt = performance.now()
    top.classList.add('drag')
    try { top.setPointerCapture(e.pointerId) } catch (err) {}
  }
  top.onpointermove = (e) => {
    if (!on) return
    dx = e.clientX - x0
    const n = performance.now()
    if (n > lt) vx = (e.clientX - lx) / (n - lt)
    lx = e.clientX; lt = n
    top.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 18 + 'deg)'
    top.style.setProperty('--ts', Math.max(0, Math.min(1, dx / 120)))
    top.style.setProperty('--tp', Math.max(0, Math.min(1, -dx / 120)))
    const ss = top.querySelector('.stamp.s'); const sp = top.querySelector('.stamp.p')
    if (ss) ss.style.opacity = Math.max(0, dx / 100)
    if (sp) sp.style.opacity = Math.max(0, -dx / 100)
    if (bk) bk.style.transform = 'scale(' + (0.95 + 0.05 * Math.min(1, Math.abs(dx) / 120)) + ') translateY(' + (12 - 12 * Math.min(1, Math.abs(dx) / 120)) + 'px)'
  }
  top.onpointerup = () => {
    if (!on) return
    if (Math.abs(dx) > 110 || (Math.abs(dx) > 50 && Math.abs(vx) > 0.6)) { on = false; decide(dx > 0 ? 1 : -1) }
    else if (Math.abs(dx) < 6) { reset(); state.sheet = 'p'; render() }
    else reset()
  }
  top.onpointercancel = reset
}

function closeModal() {
  const mo = $('#modal')
  mo.hidden = true
  mo.innerHTML = ''
}
function modalOpen(html) {
  const mo = $('#modal')
  mo.hidden = false
  mo.innerHTML = html
}
function confirmDlg(o) {
  modalOpen('<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">' + esc(o.title) + '</h2><p>' + esc(o.body) + '</p><div class="stack-v"><button class="btn btn-block' + (o.danger ? ' btn-danger' : '') + '" id="cyes">' + esc(o.yes) + '</button><button class="btn btn-sec btn-block" id="cno">Cancel</button></div></div>')
  $('#cno').onclick = closeModal
  $('#cyes').onclick = () => { closeModal(); o.fn() }
  $('#cno').focus()
}
function safetyDlg(fn) {
  modalOpen('<div class="dialog scroll" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Before your first session</h2><p class="meta">Spar at a gym, wear your gear, and tell someone.</p><ol class="safe">' + SAFE.map(t => '<li>' + t + '</li>').join('') + '</ol><div class="stack-v">' + (fn ? '<button class="btn btn-block" id="sgo">I understand, continue</button>' : '') + '<button class="btn btn-sec btn-block" id="cno">' + (fn ? 'Not now' : 'Close') + '</button></div></div>')
  $('#cno').onclick = closeModal
  const g = $('#sgo')
  if (g) g.onclick = () => {
    closeModal()
    state.cfg.ack = true
    state.me.safetyAt = new Date().toISOString()
    savePrefs()
    if (state.hasProfile) supabase.from('profiles').update({ safety_acknowledged_at: state.me.safetyAt }).eq('id', uid()).then(() => {})
    if (fn) fn()
  }
}
function reportDlg(person) {
  if (!person) return
  modalOpen('<div class="dialog scroll" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Report ' + esc(person.n) + '</h2><p class="meta">Choose the closest reason. Reports are saved for review.</p><div class="box" role="radiogroup">' + REASONS.map((t, i) => '<label class="srow rad"><input type="radio" name="rr" value="' + i + '"><span>' + t + '</span></label>').join('') + '</div><label class="field">Details (optional)<textarea id="rnote" class="input" rows="2" maxlength="500"></textarea></label><label class="srow rad"><input type="checkbox" id="rblk" checked><span>Also block ' + esc(person.n.split(' ')[0]) + '</span></label><p class="field-err" id="rerr" role="alert"></p><div class="stack-v"><button class="btn btn-block" id="rsub">Send report</button><button class="btn btn-sec btn-block" id="cno">Cancel</button></div></div>')
  $('#cno').onclick = closeModal
  $('#rsub').onclick = () => {
    const sel = document.querySelector('input[name=rr]:checked')
    if (!sel) { $('#rerr').textContent = 'Pick a reason first.'; return }
    const note = $('#rnote').value.trim().slice(0, 500)
    const blk = $('#rblk').checked
    closeModal()
    doReport(person, REASONS[+sel.value], note, blk)
  }
}
function showMatch(p, matchId) {
  const c = compat(state.me, p)
  const good = c.rows.filter(x => x.s === 'match').slice(0, 3)
  modalOpen('<div class="dialog match scroll" role="dialog" aria-modal="true" aria-labelledby="dt"><p class="eyebrow">New match</p><div class="mtitle">It&rsquo;s a spar</div><h2 id="dt">You and ' + esc(p.n) + '</h2><p>' + c.label + '.</p>' + (good.length ? '<ul class="cmp-list">' + good.map(x => '<li><b>' + x.k + '</b> ' + esc(x.t) + '</li>').join('') + '</ul>' : '') + (c.warn ? '<p class="warn"><b>Go easy.</b> Start technical.</p>' : '') + '<div class="stack-v"><button class="btn btn-block" id="mchat">Plan a session</button><button class="btn btn-sec btn-block" id="mclose">Keep swiping</button></div></div>')
  $('#mclose').onclick = closeModal
  $('#mchat').onclick = () => { closeModal(); state.tab = 'matches'; state.openMatch = String(matchId); state.sheet = 'plan'; render() }
}
function icsFor(s) {
  const m = matchById(s.match_id)
  const start = new Date(s.starts_at)
  const end = new Date(start.getTime() + 3600000)
  const f = (t) => t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const where = (s.gyms && s.gyms.name) || ''
  return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Boxing Buddies//EN\r\nBEGIN:VEVENT\r\nUID:bb-' + s.id + '@boxingbuddies\r\nDTSTAMP:' + f(new Date()) + '\r\nDTSTART:' + f(start) + '\r\nDTEND:' + f(end) + '\r\nSUMMARY:Sparring with ' + (m ? m.partner.n : 'a match') + '\r\nLOCATION:' + where + '\r\nEND:VEVENT\r\nEND:VCALENDAR'
}
function locButton(p) {
  const on = state.cfg.loc && state.cfg.loc.name === p.name
  return '<button class="srow opt" data-act="locpick" data-name="' + esc(p.name) + '" data-city="' + esc(p.city || '') + '" data-state="' + esc(p.state || '') + '" data-lat="' + p.lat + '" data-lng="' + p.lng + '" aria-checked="' + on + '"><span>' + esc(p.name) + '</span>' + (on ? '<span class="chk">&#10003;</span>' : '') + '</button>'
}
async function locRows(q) {
  const query = String(q || '').trim()
  if (isZip(query)) {
    try { return locButton(await lookupZip(query)) }
    catch (e) { return '<p class="note">' + esc(errText(e)) + '</p>' }
  }
  let cities = []
  try { cities = await ensureCities() } catch (e) { return '<p class="note">The city list did not load. ZIP search still works when you are online.</p>' }
  const rows = searchCities(cities, query, 30)
  if (!rows.length) return '<p class="note">No city matches "' + esc(query) + '". Try a ZIP code.</p>'
  return rows.map(c => locButton({ name: c[0] + ', ' + c[1], city: c[0], state: c[1], lat: c[2], lng: c[3] })).join('')
}
let saveTimer = 0
function scheduleSave() {
  if (!state.hasProfile || state.onb > 0) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveProfile({ quiet: true, keepLocal: true }).catch(e => toast(errText(e), 'err')) }, 500)
}
let radiusTimer = 0
function onRadius(value) {
  state.cfg.maxd = Number(value)
  const label = document.getElementById('dv')
  if (label) label.textContent = dist(state.cfg.maxd)
  savePrefs()
  clearTimeout(radiusTimer)
  radiusTimer = setTimeout(() => {
    Promise.all([loadGyms(), loadDeck()]).then(render).catch(e => toast(errText(e), 'err'))
  }, 280)
}

async function onClick(b) {
  const act = b.dataset.act
  const v = b.dataset.v
  if (act === 'tab') {
    state.tab = v || b.dataset.v
    state.openMatch = null
    state.sheet = false
    $('#main').scrollTop = 0
    render()
    return
  }
  if (act === 'magic') { state.authEmail = ($('#email') && $('#email').value) || state.authEmail; await sendMagic(); return }
  if (act === 'verify') await verifyCode()
  if (act === 'google') await google()
  if (act === 'auth-reset') { state.authSent = false; state.authMsg = ''; state.authErr = false; render(); return }
  if (act === 'signout') { await signOut(); return }
  if (act === 'export') { await exportProfile(); return }
  if (act === 'delete-account') {
    confirmDlg({ title: 'Delete your account?', body: 'This removes your profile, swipes, messages you sent, and photos. You will be signed out. This cannot be undone.', yes: 'Delete account', danger: true, fn: () => { deleteAccount().catch(err => toast(errText(err), 'err')) } })
    return
  }
  if (act === 'onext') {
    const problem = validateProfile(payload(), false)
    if (!state.me.n.trim()) { toast('Enter your name.', 'err'); return }
    if (state.me.a === '' || state.me.a == null) { toast('Enter your age. Boxing Buddies is for adults 18 or older.', 'err'); return }
    if (problem && /age|adult|clean|spam|long/i.test(problem)) { toast(problem, 'err'); return }
    state.onb = 2
    render()
    $('#main').scrollTop = 0
    return
  }
  if (act === 'oback') { state.onb = 1; render(); return }
  if (act === 'odone') { await finishOnboarding(); return }
  if (act === 'edit') { state.sheet = false; state.tab = 'me'; state.onb = state.hasProfile ? 0 : 1; render(); return }
  if (act === 'open' || act === 'settings') { state.sheet = state.sheet === 'settings' ? false : 'settings'; render(); return }
  if (act === 'close') { state.sheet = false; render(); return }
  if (act === 'filters') { state.sheet = 'f'; render(); return }
  if (act === 'loc') { state.locMsg = ''; state.locMsgErr = false; state.sheet = 'l'; render(); return }
  if (act === 'locback') { state.sheet = false; render(); return }
  if (act === 'locgps') { useGps(); return }
  if (act === 'locpick') {
    await setLocation({ name: b.dataset.name, lat: Number(b.dataset.lat), lng: Number(b.dataset.lng), src: 'town' })
    return
  }
  if (act === 'sort') { state.cfg.sort = v === 'near' ? 'near' : 'fit'; savePrefs(); render(); return }
  if (act === 'spar') { state.sheet = false; await decide(1); return }
  if (act === 'pass') { state.sheet = false; await decide(-1); return }
  if (act === 'fclear') { state.filters = { w: 'All', e: 'All', i: 'All', g: 'All', dy: [] }; render(); return }
  if (act === 'fw') state.filters.w = v
  if (act === 'fe') state.filters.e = v
  if (act === 'fi') state.filters.i = v
  if (act === 'fg') state.filters.g = v
  if (act === 'fd') {
    const i = state.filters.dy.indexOf(v)
    if (i < 0) state.filters.dy.push(v); else state.filters.dy.splice(i, 1)
  }
  if (act === 'pf') { state.me[b.dataset.k] = v; scheduleSave() }
  if (act === 'pd' || act === 'pt') {
    const arr = act === 'pd' ? state.me.dy : state.me.tm
    const i = arr.indexOf(v)
    if (i < 0) arr.push(v); else arr.splice(i, 1)
    scheduleSave()
  }
  if (act === 'gym') {
    state.me.gymId = v ? Number(v) : null
    const g = state.gyms.find(x => String(x.id) === String(v))
    state.me.gym = g ? g.name : ''
    scheduleSave()
  }
  if (act === 'cfg') {
    state.cfg[b.dataset.k] = v
    if (b.dataset.k === 'theme') applyTheme()
    savePrefs()
  }
  if (act === 'toggle') { state.cfg[b.dataset.k] = !state.cfg[b.dataset.k]; savePrefs() }
  if (act === 'chat') {
    state.openMatch = String(v)
    state.tab = 'matches'
    state.msgDraft = ''
    delete state.unread[String(v)]
    saveUnread()
    render()
    return
  }
  if (act === 'back') { state.openMatch = null; render(); return }
  if (act === 'send') { await sendMessage(); return }
  if (act === 'quick') { const t = $('#txt'); if (t) { t.value = v; state.msgDraft = v; const s = $('#send'); if (s) s.disabled = !v } return }
  if (act === 'plan') { state.sheet = state.sheet === 'plan' ? false : 'plan'; render(); return }
  if (act === 'book') { await proposeSession(); return }
  if (act === 'accept') { await setSessionStatus(v, 'accepted'); return }
  if (act === 'decline') { await setSessionStatus(v, 'declined'); return }
  if (act === 'cancel-session') {
    confirmDlg({ title: 'Cancel this session?', body: 'Your match will see a short note in chat.', yes: 'Cancel session', danger: true, fn: () => setSessionStatus(v, 'cancelled') })
    return
  }
  if (act === 'ics') {
    const s = state.sessions.find(x => String(x.id) === String(v))
    if (!s) return
    const a = document.createElement('a')
    a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsFor(s))
    a.download = 'sparring-session.ics'
    document.body.appendChild(a); a.click(); a.remove()
    toast('Calendar file ready')
    return
  }
  if (act === 'report') { reportDlg(personById(v) || (matchById(state.openMatch) && matchById(state.openMatch).partner) || pool()[0]); return }
  if (act === 'block') {
    const person = personById(v) || (matchById(state.openMatch) && matchById(state.openMatch).partner)
    if (!person) return
    confirmDlg({ title: 'Block ' + person.n + '?', body: 'You will no longer see each other. You can unblock them in Settings.', yes: 'Block', danger: true, fn: () => doBlock(person) })
    return
  }
  if (act === 'unblock') { await doUnblock(v); return }
  if (act === 'safety') { safetyDlg(); return }
  if (act === 'addgym') {
    const parts = (state.cfg.loc && state.cfg.loc.name || '').match(/^(?:Near\s+)?(.+),\s*([A-Z]{2})$/)
    state.gymDraft = blankGym()
    if (parts) { state.gymDraft.city = parts[1]; state.gymDraft.state = parts[2] }
    state.gymMsg = ''
    state.sheet = 'gym'
    render()
    return
  }
  if (act === 'gymsave') { await submitGym(); return }
  if (act === 'rmpic') { await removePhoto(); return }
  if (act === 'invite') { await invite(); return }
  if (['fw', 'fe', 'fi', 'fg', 'fd', 'pf', 'pd', 'pt', 'gym', 'cfg', 'toggle', 'fclear', 'sort'].includes(act)) render()
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]')
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA') return
  onClick(b).catch(err => { console.error(err); toast(errText(err), 'err') })
})
document.addEventListener('input', (e) => {
  if (e.target.id === 'email') state.authEmail = e.target.value
  if (e.target.id === 'locq') {
    state.locQ = e.target.value
    const q = e.target.value
    locRows(q).then(html => { const box = $('#loclist'); if (box && state.locQ === q) box.innerHTML = html })
    return
  }
  if (e.target.id === 'txt') {
    state.msgDraft = e.target.value
    const s = $('#send')
    if (s) s.disabled = !e.target.value.trim()
    return
  }
  if (e.target.id === 'msq') {
    state.msgQ = e.target.value
    const l = $('#mlist')
    if (l) l.innerHTML = convoRows()
    return
  }
  if (e.target.dataset && e.target.dataset.act === 'maxd') onRadius(e.target.value)
  if (e.target.id === 'gname' || e.target.id === 'gaddr' || e.target.id === 'gcity' || e.target.id === 'gweb') {
    const map = { gname: 'name', gaddr: 'address', gcity: 'city', gweb: 'website' }
    state.gymDraft[map[e.target.id]] = e.target.value
  }
  const k = e.target.dataset && e.target.dataset.f
  if (k) { state.me[k] = e.target.value; scheduleSave() }
})
document.addEventListener('change', (e) => {
  if (e.target.id === 'age18') state.agreeAdult = e.target.checked
  if (e.target.id === 'termsok') state.agreeTerms = e.target.checked
  if (e.target.id === 'pic') onPhoto(e.target.files && e.target.files[0])
  if (e.target.id === 'gstate') state.gymDraft.state = e.target.value
  if (e.target.dataset && e.target.dataset.act === 'maxd') onRadius(e.target.value)
})
document.addEventListener('keydown', (e) => {
  const mo = $('#modal')
  if (e.key === 'Escape') {
    if (mo && !mo.hidden) { closeModal(); return }
    if (state.sheet) { state.sheet = false; render() }
    return
  }
  if (e.key === 'Enter' && e.target.id === 'txt') { e.preventDefault(); sendMessage().catch(err => toast(errText(err), 'err')) }
  if (e.key === 'Enter' && e.target.id === 'email') { e.preventDefault(); onClick(e.target.closest('.onb').querySelector('[data-act="magic"]')).catch(() => {}) }
  if (state.tab === 'discover' && state.session && state.onb === 0 && !state.sheet && mo && mo.hidden && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'ArrowRight') decide(1)
    if (e.key === 'ArrowLeft') decide(-1)
  }
})
window.addEventListener('error', (e) => {
  if (e.target && e.target !== window) return
  console.error(e.error || e.message)
  toast('Something went wrong. Your account is fine. Reload if this keeps happening.', 'err')
})
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason)
  toast('Something went wrong. Your account is fine. Reload if this keeps happening.', 'err')
})
window.addEventListener('offline', () => { state.offline = true; toast('You are offline. New swipes and messages need a connection.', 'err'); render() })
window.addEventListener('online', () => {
  state.offline = false
  toast('Back online')
  if (state.session && state.hasProfile) Promise.all([loadDeck(), loadMatches(), loadGyms()]).then(render).catch(() => {})
  else render()
})

applyTheme()
const bootErr = authErrorFromUrl()
if (bootErr) { state.authErr = true; state.authMsg = bootErr.replace(/\+/g, ' ') }
supabase.auth.onAuthStateChange((event, session) => { setTimeout(() => handleAuth(event, session), 0) })
