import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { launch } from '../tools/browser.mjs'

// Проверка девяти макетов и их ключевых состояний без доступа к API приложения.
// Ожидание: экраны читаются на четырёх ширинах, переходы работают, запросов к API нет.
const base = process.env.MOCKUP_URL ?? 'http://127.0.0.1:5177'
const browser = await launch()
const errors = []
const requests = []
let checked = 0
await mkdir('shots', { recursive: true })
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (/\/api\//.test(request.url())) requests.push(request.url())
    })
    for (const direction of ['forest', 'desk', 'ember']) {
      for (const section of ['finance', 'board', 'knowledge']) {
        await page.goto(`${base}/?direction=${direction}&section=${section}`)
        await page.getByTestId('product').waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(250)
        assert.equal(await page.getByTestId('product').getAttribute('data-direction'), direction)
        assert.equal(await page.getByTestId('product').getAttribute('data-section'), section)
        assert.equal(
          await page.locator('html').evaluate((el) => el.scrollWidth <= innerWidth),
          true,
          `Page overflow: ${direction}/${section}/${width}`,
        )
        const spills = await page.getByTestId('product').evaluate((root) => {
          const bounds = root.getBoundingClientRect()
          return [...root.querySelectorAll('[role="button"], a, .ss-field')]
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return r.width && (r.left < bounds.left - 1 || r.right > bounds.right + 1)
            })
            .map((el) => el.textContent)
        })
        assert.deepEqual(spills, [], `Control overflow: ${direction}/${section}/${width}`)
        const chartOverflow = await page.locator('.ss-chart__line').evaluateAll((paths) =>
          paths.some((path) => {
            const bounds = path.getBBox()
            return bounds.x + bounds.width > path.ownerSVGElement.clientWidth + 1
          }),
        )
        assert.equal(chartOverflow, false, `Chart overflow: ${direction}/${section}/${width}`)
        if (section === 'board') {
          await page.getByRole('button', { name: 'Открыть задачу: Обновить главную страницу', exact: true }).click()
        } else if (section === 'knowledge') {
          await page.getByRole('button', { name: 'Открыть понятие: Индексы', exact: true }).first().click()
        } else {
          await page.getByRole('button', { name: 'Открыть категорию: Продукты', exact: true }).click()
        }
        await page.getByRole('dialog').waitFor()
        await page.keyboard.press('Shift+Tab')
        assert.equal(
          await page.getByRole('dialog').evaluate((dialog) => {
            const controls = dialog.querySelectorAll('[tabindex="0"]')
            return document.activeElement === controls[controls.length - 1]
          }),
          true,
          'Dialog focus trap',
        )
        await page.screenshot({ path: `shots/${direction}-${section}-${width}-detail.png`, fullPage: true })
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('dialog').count(), 0)
        await page.evaluate(() => document.activeElement?.blur())
        await page.screenshot({ path: `shots/${direction}-${section}-${width}.png`, fullPage: true })
        if (section === 'finance') {
          await page.getByRole('group', { name: 'Тип операции' }).getByRole('button', { name: 'Доход' }).click()
          assert.match(await page.locator('.form-fields').textContent(), /Зарплата/)
          await page.getByRole('group', { name: 'Валюта' }).getByRole('button', { name: 'BYN' }).click()
          assert.match(await page.locator('.form-fields').textContent(), /Сумма · BYN/)
        }
        if (section === 'board' && width === 390) {
          for (const status of ['Черновик', 'На проверке', 'На паузе', 'Готово']) {
            await page.locator('.mobile-status-picker').getByRole('button', { name: status, exact: true }).click()
            assert.match(await page.locator('.task-lane:visible').textContent(), new RegExp(status))
          }
        }
        checked++
      }
    }
    await page.goto(`${base}/?direction=forest`)
    await page
      .getByRole('button', { name: /Рабочий стол/ })
      .first()
      .click()
    assert.equal(new URL(page.url()).searchParams.get('direction'), 'desk')
    await page.getByRole('button', { name: 'Трекер', exact: true }).first().click()
    assert.equal(new URL(page.url()).searchParams.get('section'), 'board')
    await page.getByRole('button', { name: 'Новая задача', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('button', { name: 'Показать результат', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Демонстрация' }).waitFor()
    await page.getByRole('button', { name: 'Сравнить три', exact: true }).click()
    assert.equal(await page.getByTestId('product').count(), 3)
    await page.getByRole('button', { name: 'Мобильный экран', exact: true }).click()
    await page.waitForTimeout(200)
    assert.equal(
      await page
        .locator('.ss-stage')
        .evaluateAll((stages) => stages.every((stage) => stage.getBoundingClientRect().width <= 359)),
      true,
    )
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 1000 })
    await page.waitForTimeout(200)
    assert.equal(await page.locator('html').evaluate((el) => el.scrollWidth <= innerWidth), true)
    await page.close()
  }
  assert.deepEqual(errors, [], 'Browser errors')
  assert.deepEqual(requests, [], 'Unexpected production API calls')
  console.log(`PASS: ${checked} screens, detail dialogs, navigation, demo forms, no overflow or API calls`)
} finally {
  await browser.close()
}
