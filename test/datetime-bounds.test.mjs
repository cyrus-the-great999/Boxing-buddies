import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'

const gloss = readFileSync(new URL('../gloss.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('meetup when uses a visible face over the native date and time inputs', () => {
  assert.match(app, /whenSlot\('mudate', 'date'/)
  assert.match(app, /whenSlot\('mutime', 'time'/)
  assert.doesNotMatch(app, /type="datetime-local"/)
  assert.match(gloss, /\.when-slot \{[\s\S]*?overflow: hidden/)
  assert.match(gloss, /\.when-hit \{[\s\S]*?position: absolute/)
})

const chrome = '/usr/bin/google-chrome'
const puppeteerPath = '/tmp/pwtools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'

function serve() {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      const path = new URL(req.url, 'http://127.0.0.1').pathname
      const file = path === '/' ? '/index.html' : path
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : 'text/html'
      try {
        const body = readFileSync(new URL('..' + file, import.meta.url))
        res.writeHead(200, { 'content-type': type })
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
    page.on('pageerror', err => console.error(err))
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.documentElement.dataset.bb === '1', { timeout: 15000 })
    await page.evaluate(() => {
      document.body.classList.remove('onb-on')
      document.querySelector('header').hidden = false
      document.getElementById('ht').textContent = 'Meetups'
      document.getElementById('main').innerHTML = '<p class="eyebrow" id="sessions">Sessions</p><p class="meta">When you match someone, propose a time from the chat. It shows up here.</p><div class="box pad meetup-form" id="form"><label class="field">Gym<select id="gym" class="input"><option>Choose a gym</option></select></label><p class="field-l">When</p><label class="field">Date<span class="when-slot" id="date-slot"><span class="when-face is-empty" id="mudate-face">Choose a date</span><input id="mudate" class="when-hit" type="date" aria-label="Date"></span></label><label class="field">Time<span class="when-slot" id="time-slot"><span class="when-face is-empty" id="mutime-face">Choose a time</span><input id="mutime" class="when-hit" type="time" aria-label="Time"></span></label><label class="field">Rules<textarea id="rules" class="input" rows="4"></textarea></label><button class="btn btn-block" id="host">Host meetup</button><button class="chip" id="off">Lightweight</button><button class="chip" id="on" aria-pressed="true">Welterweight</button><div class="actions"><button class="ibtn lg pri" id="spar"><span>Spar</span></button></div></div>'
    })
    const box = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect()
      const style = id => getComputedStyle(document.getElementById(id))
      const gym = rect('gym')
      const date = rect('date-slot')
      const time = rect('time-slot')
      const rules = rect('rules')
      const host = rect('host')
      const form = rect('form')
      const face = document.getElementById('mudate-face').getBoundingClientRect()
      const hit = rect('mudate')
      const dateStyle = style('date-slot')
      const gymStyle = style('gym')
      const chip = style('on')
      const spar = style('spar')
      const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
      return {
        gym: { l: gym.left, r: gym.right, radius: gymStyle.borderTopRightRadius },
        date: { l: date.left, r: date.right, radiusL: dateStyle.borderTopLeftRadius, radiusR: dateStyle.borderTopRightRadius },
        time: { l: time.left, r: time.right },
        rules: { l: rules.left, r: rules.right },
        host: { l: host.left, r: host.right },
        faceInside: inside(face, date),
        hitInside: inside(hit, date),
        faceScroll: document.getElementById('mudate-face').scrollWidth,
        faceClient: document.getElementById('mudate-face').clientWidth,
        chipImage: chip.backgroundImage,
        chipShadow: chip.boxShadow,
        sparImage: spar.backgroundImage,
        sparShadow: spar.boxShadow
      }
    })
    assert.ok(Math.abs(box.date.l - box.gym.l) <= 1, 'date left ' + box.date.l)
    assert.ok(Math.abs(box.date.r - box.gym.r) <= 1, 'date right ' + box.date.r)
    assert.ok(Math.abs(box.time.l - box.gym.l) <= 1)
    assert.ok(Math.abs(box.time.r - box.gym.r) <= 1)
    assert.ok(Math.abs(box.rules.r - box.gym.r) <= 1)
    assert.ok(Math.abs(box.host.r - box.gym.r) <= 1)
    assert.ok(parseFloat(box.date.radiusL) >= 12 && parseFloat(box.date.radiusR) >= 12, box.date.radiusL + ' ' + box.date.radiusR)
    assert.equal(box.date.radiusL, box.date.radiusR)
    assert.ok(box.faceInside, 'visible date text leaves the rounded slot')
    assert.ok(box.hitInside, 'native date input leaves the rounded slot')
    assert.ok(box.faceScroll <= box.faceClient + 1)
    assert.match(box.chipImage, /linear-gradient/)
    assert.match(box.chipShadow, /inset/)
    assert.match(box.sparImage, /linear-gradient/)
    assert.match(box.sparShadow, /inset/)
    await page.focus('#mudate')
    await page.$eval('#mudate', el => {
      el.value = '2026-11-14'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const filled = await page.evaluate(() => ({
      value: document.getElementById('mudate').value,
      face: document.getElementById('mudate-face').textContent,
      active: document.activeElement.id
    }))
    assert.equal(filled.value, '2026-11-14')
    assert.equal(filled.active, 'mudate')
    assert.doesNotMatch(filled.face, /Choose a date/)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
