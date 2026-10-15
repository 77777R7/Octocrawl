import { describe, expect, it } from 'vitest'
import { classifyGate } from '../src/gate.js'

// Synthetic counterpart of the captured 200 challenge. Raw pages stay private.
const url = 'https://www.skyscanner.net/sttc/px/captcha-v2/index.html?url=L3JvdXRlcw=='
const heading = '<h1>Are you a person or a robot?</h1>'
const controls = '<div id="px-captcha"><iframe title="Human verification challenge"></iframe></div>'
const page = (content = heading + controls) => `<html><head><title>Skyscanner</title></head><body>${content}</body></html>`
const verdict = (body = page(), finalUrl = url, contentful = false) => classifyGate({ status: 200, header: () => null, body, finalUrl, contentful })

describe('Skyscanner dedicated human challenge', () => {
  it('requires its URL, primary heading and rendered challenge components, even if extraction finds text', () => {
    for (const contentful of [false, true]) expect(verdict(page(), url, contentful)).toMatchObject({ reason: 'captcha' })
  })

  it('does not classify the ordinary route, another host, copy or a component alone', () => {
    expect(verdict(page(), 'https://www.skyscanner.net/routes/lond/pari/london-to-paris.html')).toBeNull()
    expect(verdict(page(), 'https://example.com/sttc/px/captcha-v2/index.html')).toBeNull()
    expect(verdict(page(), 'not a URL')).toBeNull()
    expect(verdict(page(heading))).toBeNull()
    expect(verdict(page(controls))).toBeNull()
    expect(verdict(page(heading + '<div id="px-captcha"></div>'))).toBeNull()
    expect(verdict(page(heading + '<iframe title="Human verification challenge"></iframe>'))).toBeNull()
  })

  it('ignores quoted, commented, hidden-template and script controls and bounds its scan', () => {
    for (const quoted of [`<!--${controls}-->`, `<script>const sample = '${controls}'</script>`, `<template>${controls}</template>`, '&lt;div id="px-captcha"&gt;&lt;iframe title="Human verification challenge"&gt;']) {
      expect(verdict(page(heading + quoted))).toBeNull()
    }
    expect(verdict(page(`<script>${'x'.repeat(1_000_001)}</script>` + heading + controls))).toBeNull()
    expect(verdict(page(heading + controls + '<p>' + 'ordinary article. '.repeat(150) + '</p>'))).toBeNull()
  })
})
