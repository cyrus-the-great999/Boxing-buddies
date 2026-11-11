import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'

const gloss = readFileSync(new URL('../gloss.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('meetup when uses separate date and time controls without clipping', () => {
  assert.match(app, /type="date"/)
  assert.match(app, /type="time"/)
  assert.doesNotMatch(app, /type="datetime-local"/)
  assert.match(gloss, /\.meetup-form,\s*\.box\.pad\.meetup-form \{[^}]*overflow: visible/)
  assert.match(gloss, /\.meetup-form \.field \{[^}]*overflow: visible/)
  assert.doesNotMatch(gloss, /\.meetup-form \.field \{[^}]*overflow: hidden/)
})

const chrome = '/usr/bin/google-chrome'
const puppeteerPath = '/tmp/pwtools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'

function serve() {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      const path = new URL(req.url, 'http://127.0.0.1').pathname
      const file = path === '/' ? '/index.html' : path
      try {
        const body = readFileSync(new URL('..' + file, import.meta.url))
        res.writeHead(200)
        res.end(body)
      } catch {
        res.writeHead(404)
        res.end('missing')
      }
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

test('date and time controls match the gym field and are not clipped', { skip: !existsSync(chrome) || !existsSync(puppeteerPath) ? 'Chrome or puppeteer-core is not available' : false }, async () => {
  const puppeteer = await import(puppeteerPath)
  const server = await serve()
  const { port } = server.address()
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      document.body.classList.remove('onb-on')
      document.querySelector('header').hidden = false
      document.getElementById('ht').textContent = 'Meetups'
      document.getElementById('main').innerHTML = '<p class="eyebrow" id="sessions">Sessions</p><p class="meta">When you match someone, propose a time from the chat. It shows up here.</p><div class="box pad meetup-form" id="form"><label class="field">Gym<select id="gym" class="input"><option>Choose a gym</option></select></label><p class="field-l">When</p><label class="field">Date<input id="mudate" class="input" type="date"></label><label class="field">Time<input id="mutime" class="input" type="time"></label><label class="field">Rules<textarea id="rules" class="input" rows="4"></textarea></label><button class="btn btn-block" id="host">Host meetup</button></div>'
    })
    const box = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect()
      const style = id => getComputedStyle(document.getElementById(id))
      const gym = rect('gym')
      const date = rect('mudate')
      const time = rect('mutime')
      const rules = rect('rules')
      const host = rect('host')
      const form = rect('form')
      const header = document.querySelector('header').getBoundingClientRect()
      const sessions = rect('sessions')
      const dateStyle = style('mudate')
      const gymStyle = style('gym')
      const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1
      return {
        gym: { l: gym.left, r: gym.right, radius: gymStyle.borderTopRightRadius },
        date: { l: date.left, r: date.right, w: date.width, h: date.height, radius: dateStyle.borderTopRightRadius, scroll: document.getElementById('mudate').scrollWidth, client: document.getElementById('mudate').clientWidth },
        time: { l: time.left, r: time.right },
        rules: { l: rules.left, r: rules.right },
        host: { l: host.left, r: host.right },
        formOverflow: style('form').overflow,
        fieldOverflow: getComputedStyle(document.querySelector('#form .field')).overflow,
        dateInside: inside(date, form),
        timeInside: inside(time, form),
        sessionsTop: sessions.top,
        headerBottom: header.bottom,
        sessionsOverlap: sessions.top < header.bottom - 1
      }
    })
    assert.equal(box.formOverflow, 'visible')
    assert.equal(box.fieldOverflow, 'visible')
    assert.ok(box.dateInside, JSON.stringify(box.date))
    assert.ok(box.timeInside)
    assert.ok(Math.abs(box.date.l - box.gym.l) <= 1, 'date left ' + box.date.l + ' gym ' + box.gym.l)
    assert.ok(Math.abs(box.date.r - box.gym.r) <= 1, 'date right ' + box.date.r + ' gym ' + box.gym.r)
    assert.ok(Math.abs(box.time.l - box.gym.l) <= 1)
    assert.ok(Math.abs(box.time.r - box.gym.r) <= 1)
    assert.ok(Math.abs(box.rules.l - box.gym.l) <= 1)
    assert.ok(Math.abs(box.rules.r - box.gym.r) <= 1)
    assert.ok(Math.abs(box.host.l - box.gym.l) <= 1)
    assert.ok(Math.abs(box.host.r - box.gym.r) <= 1)
    assert.ok(parseFloat(box.date.radius) >= 8, 'date radius ' + box.date.radius)
    assert.equal(box.date.radius, box.gym.radius)
    assert.ok(box.date.scroll <= box.date.client + 1, 'date content is wider than the control')
    assert.equal(box.sessionsOverlap, false, 'Sessions top ' + box.sessionsTop + ' header bottom ' + box.headerBottom)
    await page.focus('#mudate')
    await page.$eval('#mudate', el => { el.value = '2026-11-14' })
    await page.$eval('#mutime', el => { el.value = '19:30' })
    const filled = await page.evaluate(() => ({
      date: document.getElementById('mudate').value,
      time: document.getElementById('mutime').value,
      active: document.activeElement.id
    }))
    assert.equal(filled.date, '2026-11-14')
    assert.equal(filled.time, '19:30')
    assert.equal(filled.active, 'mudate')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
