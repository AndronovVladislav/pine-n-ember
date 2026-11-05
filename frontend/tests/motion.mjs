import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'
import { testDataMotion } from './motion-data.mjs'
import { testDialogInterruptions } from './motion-dialog.mjs'

const scenario = process.argv[2]
assert.ok(['dialog', 'reduced', 'board', 'finance', 'interrupt'].includes(scenario), 'Choose a valid motion scenario')
const base = 'http://127.0.0.1:5191'
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5191', '--strictPort'],
  { stdio: 'ignore' },
)
/** @type {import('playwright-core').Browser | undefined} */
let browser

/**
 * Ждём завершения реально запущенных переходов выбранного элемента.
 * Ожидание: проверка не зависит от произвольного ожидания в миллисекундах.
 * @param {import('playwright-core').Locator} element
 * @returns {Promise<void>}
 */
async function finishAnimations(element) {
  await element.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})))
  })
}

try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.equal(server.exitCode, null, 'The isolated preview must stay running')
    try {
      ready = (await fetch(base)).ok
    } catch {
      // Preview ещё запускается.
    }
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'The isolated preview must start')
  browser = await chromium.launch({ channel: 'chrome' })

  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: scenario === 'reduced' ? 'reduce' : 'no-preference',
    })
    page.setDefaultTimeout(5000)
    /** @type {string[]} */
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    if (scenario === 'interrupt') {
      await testDialogInterruptions(page, base)
      assert.deepEqual(errors, [])
      await page.close()
      continue
    }
    if (scenario === 'board' || scenario === 'finance') {
      await testDataMotion(page, scenario, base)
      assert.deepEqual(errors, [])
      await page.close()
      continue
    }
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      assert.equal(request.method(), 'GET', 'Motion checks must not mutate application data')
      const path = new URL(request.url()).pathname
      if (path === '/api/board')
        return route.fulfill({
          json: {
            statuses: [{ key: 'draft', label: 'Черновик', color: '#6b8f74' }],
            queues: [{ key: 'pet', label: 'PET PROJECTS', bg: '#1f3b2c', text: '#dce9d6', position: 0 }],
            tasks: [],
          },
        })
      if (path === '/api/knowledge')
        return route.fulfill({
          json: {
            blocks: [],
            topics: [{ id: 'topic', block_id: null, name: 'Тестовая тема', description: '', concepts: [] }],
          },
        })
      throw new Error(`Unexpected request: ${request.method()} ${path}`)
    })
    await page.goto(base)
    const open = page.getByRole('button', { name: 'Новая задача', exact: true })
    await open.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()

    if (scenario === 'dialog') {
      // Проверяем вход, выход и фокус диалога при обычной настройке движения.
      // Ожидание: оба перехода действительно запускаются, а удаление происходит после выхода.
      const entering = await dialog.evaluate((node) =>
        node.getAnimations().map((animation) => ({
          duration: Number(animation.effect.getTiming().duration),
          iterations: animation.effect.getTiming().iterations,
        })),
      )
      assert.ok(entering.length > 0, 'Opening the dialog must start a visible transition')
      assert.ok(entering.every((animation) => animation.duration >= 120 && animation.duration <= 240))
      assert.ok(entering.every((animation) => animation.iterations === 1))
      await finishAnimations(dialog)
      const bounds = await dialog.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width)
      await page.keyboard.press('Escape')
      assert.equal(await dialog.count(), 1, 'The dialog must remain mounted during its exit')
      assert.ok(await dialog.evaluate((node) => node.getAnimations().length > 0), 'Closing must animate')
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await open.evaluate((node) => node === document.activeElement), true)
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
    } else {
      // Проверяем системное отключение движения, включая перенесённую анимацию тем БЗ.
      // Ожидание: диалог закрывается сразу, у темы нет длительной анимации или перехода.
      assert.equal(
        await dialog.evaluate((node) =>
          node.getAnimations().some((animation) => Number(animation.effect.getTiming().duration) > 1),
        ),
        false,
      )
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await open.evaluate((node) => node === document.activeElement), true)
      await page.getByRole('link', { name: 'База знаний', exact: true }).click()
      const topic = page.locator('.topic-card').filter({ hasText: 'Тестовая тема' })
      await topic.waitFor()
      const durations = await topic.evaluate((node) => {
        const style = getComputedStyle(node)
        return [style.animationDuration, style.transitionDuration].flatMap((value) =>
          value.split(',').map((part) => parseFloat(part)),
        )
      })
      assert.ok(
        durations.every((duration) => duration <= 0.001),
        'Reduced motion must disable inherited effects',
      )
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(`PASS: ${scenario} motion at desktop and mobile widths`)
} finally {
  await browser?.close()
  server.kill()
}
