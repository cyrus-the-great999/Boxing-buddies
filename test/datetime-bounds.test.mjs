import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'

const gloss = readFileSync(new URL('../gloss.css', import.meta.url), 'utf8')

test('the meetup datetime control is constrained to its field', () => {
  assert.match(gloss, /\.meetup-form input\[type="datetime-local"\][\s\S]*?min-width: 0;/)
  assert.match(gloss, /\.meetup-form input\[type="datetime-local"\][\s\S]*?max-width: 100%;/)
  assert.match(gloss, /\.meetup-form \.field \{ display: block; min-width: 0; max-width: 100%; overflow: hidden; \}/)
  assert.match(gloss, /min-inline-size: 0;/)
})

const chrome = '/usr/bin/google-chrome'
const puppeteerPath = '/tmp/pwtools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'

test('a datetime-local field stays inside the meetup form', { skip: !existsSync(chrome) || !existsSync(puppeteerPath) ? 'Chrome or puppeteer-core is not available' : false }, async () => {
  const puppeteer = await import(puppeteerPath)
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      document.body.classList.remove('onb-on')
      document.querySelector('header').hidden = false
      document.getElementById('main').innerHTML = '<div class="box pad meetup-form" id="form"><label class="field">When<input id="when" class="input" type="datetime-local"></label><label class="field">Rules<textarea class="input" rows="3"></textarea></label></div>'
    })
    const box = await page.evaluate(() => {
      const form = document.getElementById('form').getBoundingClientRect()
      const when = document.getElementById('when').getBoundingClientRect()
      const rules = document.querySelector('textarea').getBoundingClientRect()
      return {
        formRight: form.right, formLeft: form.left,
        whenRight: when.right, whenLeft: when.left, whenWidth: when.width,
        rulesRight: rules.right
      }
    })
    assert.ok(box.whenLeft >= box.formLeft - 1, 'datetime left ' + box.whenLeft + ' form ' + box.formLeft)
    assert.ok(box.whenRight <= box.formRight + 1, 'datetime right ' + box.whenRight + ' form ' + box.formRight)
    assert.ok(Math.abs(box.whenRight - box.rulesRight) <= 2, 'datetime and rules right edges differ')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
