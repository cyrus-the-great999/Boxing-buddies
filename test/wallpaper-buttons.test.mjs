import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gloss = readFileSync(new URL('../gloss.css', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('the ribbon wallpaper layer is not suppressed', () => {
  assert.match(index, /body::before\{content:"";position:fixed;inset:0;[^}]*url\("img\/bg\.jpg"\)/)
  assert.match(gloss, /#app::before, #app::after \{ content: none !important; display: none !important; \}/)
  assert.doesNotMatch(gloss, /body::before,\s*body::after\s*\{[^}]*display:\s*none/)
  assert.match(gloss, /\.atmo \.arc, \.atmo \.arc2 \{ display: none; \}/)
})

test('secondary buttons keep one edge and primary actions keep the red-to-black fill', () => {
  assert.match(gloss, /\.btn\.btn-sec,\s*\.btn\.btn-sec:hover,[\s\S]*?box-shadow: none;/)
  assert.match(gloss, /background: linear-gradient\(90deg, #E23A42 0%, #9E1822 46%, #14080A 100%\);/)
  assert.match(gloss, /-webkit-appearance: none;/)
  assert.match(sw, /const C='bb-shell-22'/)
  assert.match(sw, /\.\/img\/bg\.jpg/)
  assert.match(gloss, /inset 0 0 0 1px rgba\(213, 216, 222, \.14\)/)
  assert.match(gloss, /#sheet \.panel\.filters \.box/)
  assert.match(gloss, /\.row-gap \{ flex-wrap: wrap; \}/)
  assert.doesNotMatch(app, /emptyArt\('bag'\)/)
})
