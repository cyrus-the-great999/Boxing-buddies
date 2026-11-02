import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  STATES, milesBetween, searchCities, nearestCity, findCity, compat, filterDeck,
  parseSlot, nextOccurrence, orderedPair, gymVisibleTo, isZip, safeHttps, CONFIRMATIONS_REQUIRED,
  messageProblem, MESSAGE_MAX, emailLooksValid, normalizeEmailCode, emailCodeProblem,
  authProblem, signInEmailResult, resendWaitSec, EMAIL_RATE_LIMIT_MESSAGE,
  choiceSnapshot, restoreChoices, sortByDistance,
  approxCoord, waiverDue, profileIsAdult, avatarProblem, missingRpc, WAIVER_VERSION, AVATAR_MAX_BYTES
} from '../logic.mjs'

const cities = JSON.parse(readFileSync(new URL('../data/us-cities.json', import.meta.url)))

test('city list covers every state and Washington DC', () => {
  const have = new Set(cities.map(c => c[1]))
  for (const [code] of STATES) assert.equal(have.has(code), true, code)
  assert.equal(have.has('PR'), false)
  assert.equal(STATES.filter(([code]) => code !== 'DC').length, 50)
})

test('distance from Marlborough to Boston is a short drive', () => {
  const miles = milesBetween(42.3459, -71.5523, 42.3601, -71.0589)
  assert.ok(miles > 20 && miles < 35, miles)
  assert.ok(Math.abs(milesBetween(30, -97, 30, -97)) < 0.001)
})

test('city search finds Austin, TX and ignores ZIP-shaped queries', () => {
  const rows = searchCities(cities, 'austin, tx', 10)
  assert.ok(rows.some(c => c[0] === 'Austin' && c[1] === 'TX'))
  assert.equal(searchCities(cities, '78701').length, 0)
  assert.equal(isZip('01752'), true)
  assert.equal(isZip('0175'), false)
})

test('nearest city to downtown Austin is in Texas', () => {
  const near = nearestCity(cities, 30.2713, -97.7426)
  assert.equal(near.state, 'TX')
  assert.ok(near.miles < 15, near.miles)
  const hit = findCity(cities, 'Honolulu', 'HI')
  assert.ok(hit)
  assert.ok(hit.lat > 21 && hit.lat < 22)
})

test('deck drops self, swipes, blocks, and people outside the radius', () => {
  const me = { w: 'Welterweight', exp: 'Intermediate', st: 'Orthodox', int: 'Light', gl: 'Technical work', dy: ['Tue'], tm: ['Evening'] }
  const people = [
    { id: 'me', n: 'Me', w: 'Welterweight', exp: 'Intermediate', int: 'Light', gl: 'Technical work', dy: ['Tue'], tm: ['Evening'], d: 2, v: false },
    { id: 'near', n: 'Near', w: 'Welterweight', exp: 'Intermediate', int: 'Light', gl: 'Technical work', dy: ['Tue'], tm: ['Evening'], d: 4, v: true },
    { id: 'far', n: 'Far', w: 'Welterweight', exp: 'Intermediate', int: 'Light', gl: 'Technical work', dy: ['Tue'], tm: ['Evening'], d: 80, v: false },
    { id: 'seen', n: 'Seen', w: 'Welterweight', exp: 'Intermediate', int: 'Light', gl: 'Technical work', dy: ['Tue'], tm: ['Evening'], d: 3, v: false },
    { id: 'blocked', n: 'Blocked', w: 'Welterweight', exp: 'Intermediate', int: 'Light', gl: 'Technical work', dy: ['Tue'], tm: ['Evening'], d: 3, v: false },
    { id: 'other', n: 'Other', w: 'Heavyweight', exp: 'Beginner', int: 'Hard', gl: 'Fight prep', dy: ['Sun'], tm: ['Morning'], d: 12, v: false }
  ]
  const deck = filterDeck(people, {
    selfId: 'me', me, maxMiles: 40, sort: 'fit',
    swiped: new Set(['seen']), blocked: new Set(['blocked']),
    filters: { w: 'All', e: 'All', i: 'All', g: 'All', dy: [], verified: false }
  })
  assert.deepEqual(deck.map(p => p.id), ['near', 'other'])
  const verified = filterDeck(people, {
    selfId: 'me', me, maxMiles: 40, sort: 'near',
    swiped: new Set(), blocked: new Set(),
    filters: { verified: true }
  })
  assert.deepEqual(verified.map(p => p.id), ['near'])
})

test('same weight and intensity scores higher than a mismatch', () => {
  const me = { w: 'Lightweight', exp: 'Intermediate', int: 'Light', gl: 'Fitness', dy: ['Sat'], tm: ['Morning'] }
  const twin = { w: 'Lightweight', exp: 'Intermediate', int: 'Light', gl: 'Fitness', dy: ['Sat'], tm: ['Morning'], d: 5 }
  const far = { w: 'Heavyweight', exp: 'Beginner', int: 'Hard', gl: 'Fight prep', dy: ['Mon'], tm: ['Evening'], d: 40 }
  assert.ok(compat(me, twin).score > compat(me, far).score)
  assert.equal(compat(me, far).warn, true)
})

test('session slots land in the next week', () => {
  const slot = parseSlot('Tue 7:00pm')
  assert.deepEqual(slot, { day: 'Tue', hour: 19, minute: 0 })
  const now = new Date('2026-11-01T15:00:00')
  const next = nextOccurrence(slot.day, slot.hour, slot.minute, now)
  assert.ok(next > now)
  assert.ok(next - now < 8 * 24 * 3600 * 1000)
  assert.equal(next.getDay(), 2)
  assert.equal(next.getHours(), 19)
  assert.equal(parseSlot('nope'), null)
})

test('messages block spam, extra links, profanity, and overrun length', () => {
  assert.equal(messageProblem('Thursday at the gym?'), '')
  assert.match(messageProblem('see https://a.com https://b.com https://c.com'), /links/i)
  assert.match(messageProblem('join t.me/spam'), /spam/i)
  assert.match(messageProblem('this is shit'), /clean/i)
  assert.match(messageProblem('x'.repeat(MESSAGE_MAX + 1)), /long/i)
})

test('email sign-in errors stay on screen and a rate limit is readable', () => {
  assert.equal(emailLooksValid('boxer@example.com'), true)
  assert.equal(emailLooksValid('not-an-email'), false)
  assert.equal(normalizeEmailCode('12 34-56'), '123456')
  assert.equal(normalizeEmailCode('code 1234567'), '123456')
  assert.match(emailCodeProblem(''), /6-digit/)
  assert.match(emailCodeProblem('123'), /all 6/)
  assert.equal(emailCodeProblem('123 456'), '')

  const limited = { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }
  assert.equal(authProblem(limited), EMAIL_RATE_LIMIT_MESSAGE)
  assert.equal(authProblem({ message: 'For security purposes, you can only request this after 60 seconds.', status: 429 }), EMAIL_RATE_LIMIT_MESSAGE)
  assert.match(authProblem({ code: 'otp_expired', message: 'Token has expired or is invalid' }), /did not work/)
  assert.match(authProblem({ message: 'Failed to fetch' }), /offline/)
  assert.equal(authProblem({ status: 500, message: '' }), 'Sign-in is having trouble right now. Try again in a minute, or use Google.')
  assert.equal(authProblem(null), '')

  assert.deepEqual(signInEmailResult(null), { ok: true, message: '' })
  assert.deepEqual(signInEmailResult(limited), { ok: false, message: EMAIL_RATE_LIMIT_MESSAGE })
})

test('resend code waits 60 seconds', () => {
  const t0 = 1700000000000
  assert.equal(resendWaitSec(0, t0), 0)
  assert.equal(resendWaitSec(t0, t0), 60)
  assert.equal(resendWaitSec(t0, t0 + 1000), 59)
  assert.equal(resendWaitSec(t0, t0 + 59999), 1)
  assert.equal(resendWaitSec(t0, t0 + 60000), 0)
})

test('a failed save can put chip choices back', () => {
  const me = { w: 'Lightweight', exp: 'Beginner', st: 'Orthodox', int: 'Light', gl: 'Fitness', dy: ['Tue'], tm: ['Evening'], gymId: 4, gym: 'Title' }
  const saved = choiceSnapshot(me)
  me.exp = 'Intermediate'
  me.dy.push('Thu')
  me.gymId = 9
  assert.deepEqual(saved, { w: 'Lightweight', exp: 'Beginner', st: 'Orthodox', int: 'Light', gl: 'Fitness', dy: ['Tue'], tm: ['Evening'], gymId: 4, gym: 'Title' })
  restoreChoices(me, saved)
  assert.equal(me.exp, 'Beginner')
  assert.deepEqual(me.dy, ['Tue'])
  assert.equal(me.gymId, 4)
  me.dy.push('Sat')
  assert.deepEqual(saved.dy, ['Tue'])
  assert.equal(restoreChoices(me, null), me)
})

test('gyms sort nearest first so a wide search keeps the close ones', () => {
  const rows = [
    { id: 'far', lat: 41.5, lng: -74.0 },
    { id: 'none' },
    { id: 'near', lat: 40.75, lng: -73.99 },
    { id: 'mid', lat: 40.9, lng: -74.1 }
  ]
  const sorted = sortByDistance(rows, 40.7128, -74.006)
  assert.deepEqual(sorted.map(r => r.id), ['near', 'mid', 'far', 'none'])
  assert.deepEqual(rows.map(r => r.id), ['far', 'none', 'near', 'mid'])
})

test('coordinates round to about a kilometer and only adults are listable', () => {
  assert.equal(approxCoord(42.34591), 42.35)
  assert.equal(approxCoord(-71.55234), -71.55)
  assert.equal(approxCoord(null), null)
  assert.equal(profileIsAdult({ adult_confirmed: true, age: 18 }), true)
  assert.equal(profileIsAdult({ adult_confirmed: true, age: 17 }), false)
  assert.equal(profileIsAdult({ adult_confirmed: false, age: 30 }), false)
  assert.equal(waiverDue(null, null), true)
  assert.equal(waiverDue('2026-11-02T00:00:00Z', 'old'), true)
  assert.equal(waiverDue('2026-11-02T00:00:00Z', WAIVER_VERSION), false)
  assert.equal(avatarProblem({ type: 'image/jpeg', size: 1000 }), '')
  assert.match(avatarProblem({ type: 'image/gif', size: 1000 }), /JPG/)
  assert.match(avatarProblem({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 }), /5 MB/)
  assert.equal(missingRpc({ code: 'PGRST202', message: 'Could not find the function public.discover_profiles' }), true)
  assert.equal(missingRpc({ message: 'permission denied' }), false)
})

test('match pair ordering and gym visibility', () => {
  assert.deepEqual(orderedPair('b', 'a'), ['a', 'b'])
  assert.equal(gymVisibleTo({ status: 'approved', submitted_by: null }, 'someone'), true)
  assert.equal(gymVisibleTo({ status: 'pending', submitted_by: 'owner' }, 'owner'), true)
  assert.equal(gymVisibleTo({ status: 'pending', submitted_by: 'owner' }, 'other'), false)
  assert.equal(CONFIRMATIONS_REQUIRED, 3)
  assert.equal(safeHttps('https://example.com/gym'), 'https://example.com/gym')
  assert.equal(safeHttps('javascript:alert(1)'), '')
})
