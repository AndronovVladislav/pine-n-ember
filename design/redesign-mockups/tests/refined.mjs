import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { launch } from '../tools/browser.mjs'

// Проверка макета, объединяющего выбранные пользователем решения.
// Ожидание: исходный порядок разделов, финансы из первого варианта и прежняя БЗ с номерами понятий.
const base = process.env.MOCKUP_URL ?? 'http://127.0.0.1:5177'
const browser = await launch()
const errors = []
await mkdir('shots', { recursive: true })
let checked = 0
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/**', (route) => {
      errors.push('Unexpected application API call')
      return route.abort()
    })
    await page.goto(base)
    assert.equal(await page.getByTestId('product').getAttribute('data-direction'), 'refined')
    for (const section of ['finance', 'board', 'knowledge']) {
      await page.goto(`${base}/?direction=refined&section=${section}`)
      const product = page.getByTestId('product')
      await product.waitFor()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(200)
      assert.deepEqual(
        await page.getByRole('navigation', { name: 'Разделы приложения' }).getByRole('button').allTextContents(),
        ['Трекер', 'База знаний', 'Финансы'],
      )
      assert.equal(await product.getAttribute('data-shell'), 'sidebar')
      assert.equal(await page.locator('html').evaluate((root) => root.scrollWidth <= innerWidth), true)
      if (section === 'finance') {
        assert.equal(await page.locator('.finance-screen').getAttribute('data-design'), 'forest')
        assert.equal(await page.locator('.finance-overview .balance-number').textContent(), '56 200 ₽')
        assert.equal(await page.locator('.finance-details .chart-panel').count(), 1)
      }
      if (section === 'board') {
        assert.equal(await page.locator('.existing-board').count(), 1)
        assert.equal(await page.locator('.existing-column:visible').count(), 5)
        assert.equal(await page.locator('.existing-task').count(), 9)
        assert.equal(await page.locator('.mobile-status-picker, .task-meta, .board-summary').count(), 0)
        const card = page.locator('.existing-task').first()
        assert.equal(await card.evaluate((element) => getComputedStyle(element).borderLeftWidth), '3px')
        assert.equal(await card.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(22, 36, 27)')
        assert.match(
          await page
            .locator('.existing-task-done .existing-task-title')
            .first()
            .evaluate((element) => getComputedStyle(element).textDecorationLine),
          /line-through/,
        )
        assert.equal(
          await page
            .locator('.existing-column')
            .first()
            .evaluate((element) => getComputedStyle(element).width),
          '240px',
        )
        await page.getByRole('button', { name: 'Открыть задачу: Обновить главную страницу', exact: true }).click()
        await page.getByRole('dialog').waitFor()
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('dialog').count(), 0)
        await page.evaluate(() => document.activeElement?.blur())
      }
      if (section === 'knowledge') {
        assert.equal(await page.locator('.existing-knowledge').count(), 1)
        assert.equal(await page.locator('.knowledge-workspace, .knowledge-feature, .knowledge-filter').count(), 0)
        assert.deepEqual(await page.locator('.existing-topic').first().locator('.concept-index').allTextContents(), [
          '01',
          '02',
          '03',
        ])
        const number = page.locator('.existing-topic').first().locator('.concept-index').first()
        const style = await number.evaluate((element) => ({
          font: getComputedStyle(element).fontFamily,
          gap: getComputedStyle(element).marginRight,
        }))
        assert.match(style.font, /JetBrains Mono/)
        assert.equal(style.gap, '12px')
        const concept = page.getByRole('button', { name: 'Раскрыть понятие: Индексы', exact: true })
        await concept.click()
        assert.equal(await concept.getAttribute('aria-expanded'), 'true')
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.match(
          await page.locator('.existing-concept-description:visible').textContent(),
          /вспомогательная структура/,
        )
        await concept.click()
        assert.equal(await concept.getAttribute('aria-expanded'), 'false')
        await concept.evaluate((element) => element.blur())
      }
      const spills = await product.evaluate((root) => {
        const rect = root.getBoundingClientRect()
        return [...root.querySelectorAll('[role="button"], .ss-field')]
          .filter((element) => {
            const bounds = element.getBoundingClientRect()
            return bounds.width && (bounds.left < rect.left - 1 || bounds.right > rect.right + 1)
          })
          .map((element) => element.textContent)
      })
      assert.deepEqual(spills, [], `${section}/${width}: control overflow`)
      await page.waitForTimeout(100)
      await page.screenshot({ path: `shots/refined-${section}-${width}.png`, fullPage: true })
      checked++
    }
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log(
    `PASS: ${checked} refined screens, navigation order, forest finance, original board, knowledge and numbering`,
  )
} finally {
  await browser.close()
}
