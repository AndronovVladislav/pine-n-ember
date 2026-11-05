import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

// Проверяем ошибки записи, настройки и крайние значения графика без реальной БД.
// Ожидание: повтор не создаёт категорию дважды, диапазон проверяется, устаревший ответ не заменяет текущий.
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5191', '--strictPort'],
  { stdio: 'ignore' },
)
/** @type {import('playwright-core').Browser | undefined} */
let browser
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:5191')).ok) break
    } catch {
      /* Сервер ещё запускается. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(5000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  /** @type {Array<{id: string, name: string, kind: string}>} */
  const categories = []
  let creations = 0
  let attempts = 0
  /** @type {Array<{date: string, cumulative_rub: string}>} */
  let series = []
  /** @type {(() => void) | undefined} */
  let releaseOld
  await page.addInitScript(() =>
    localStorage.setItem(
      'financeRange',
      JSON.stringify({
        preset: 'custom',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ),
  )
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/finance/dashboard')
      return route.fulfill({
        json: {
          income_total_rub: '0',
          expense_total_rub: '0',
          balance_rub: '0',
          expense_by_category: [],
          income_by_category: [],
          balance_series: series,
          recent_operations: [],
        },
      })
    if (url.pathname === '/api/finance/expense-categories') {
      if (request.method() === 'POST') {
        creations++
        const category = { id: 'created', name: 'Транспорт', kind: 'expense' }
        assert.deepEqual(request.postDataJSON(), { name: category.name })
        categories.push(category)
        return route.fulfill({ json: category })
      }
      return route.fulfill({ json: categories })
    }
    if (url.pathname === '/api/finance/income-categories')
      return route.fulfill({ json: [{ id: 'income', name: 'Доход', kind: 'income' }] })
    if (url.pathname === '/api/finance/expenses') {
      attempts++
      assert.deepEqual(request.postDataJSON(), {
        category_id: 'created',
        amount: '20',
        currency: 'BYN',
        date: '2026-10-05',
        description: 'Проезд',
      })
      if (attempts === 1) return route.fulfill({ status: 502, json: { detail: 'Rate unavailable' } })
      return route.fulfill({ json: { id: 'saved' } })
    }
    if (url.pathname === '/api/finance/incomes') {
      assert.deepEqual(request.postDataJSON(), {
        category_id: 'income',
        amount: '30',
        currency: 'RUB',
        date: '2026-10-05',
      })
      return route.fulfill({ json: { id: 'income-operation' } })
    }
    if (url.pathname === '/api/finance/categories/old/operations') {
      await new Promise((resolve) => {
        releaseOld = resolve
      })
      return route
        .fulfill({
          json: [
            {
              id: 'old-op',
              kind: 'expense',
              date: '2026-10-01',
              amount: '1',
              currency: 'RUB',
              description: 'Устаревший ответ',
            },
          ],
        })
        .catch(() => {})
    }
    if (url.pathname === '/api/finance/categories/new/operations')
      return route.fulfill({
        json: [
          {
            id: 'new-op',
            kind: 'expense',
            date: '2026-10-02',
            amount: '2',
            currency: 'RUB',
            description: 'Новая категория',
          },
        ],
      })
    throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`)
  })
  await page.goto('http://127.0.0.1:5191/#/finance')
  await page.getByRole('heading', { name: 'Новая операция', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Начало периода').inputValue(), '2026-10-01')
  await page.getByLabel('Начало периода').fill('2026-10-20')
  await page.getByLabel('Конец периода').fill('2026-10-10')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.equal(await page.getByLabel('Конец периода').evaluate((field) => field.validity.valid), false)
  // Исправление любой границы должно позволять повторно применить диапазон.
  await page.getByLabel('Начало периода').fill('2026-10-01')
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/finance/dashboard?date_from=2026-10-01&date_to=2026-10-10'),
    ),
    page.getByRole('button', { name: 'Применить', exact: true }).click(),
  ])
  assert.equal(await page.getByLabel('Конец периода').evaluate((field) => field.validity.valid), true)
  await page.getByRole('status').filter({ hasText: 'Загрузка…' }).waitFor({ state: 'hidden' })
  await page.getByLabel('Название категории', { exact: true }).fill('Транспорт')
  await page.getByLabel('Сумма', { exact: true }).fill('20')
  await page.getByLabel('Описание', { exact: true }).fill('Проезд')
  await page.getByLabel('Дата', { exact: true }).fill('2026-10-05')
  await page.getByRole('button', { name: 'BYN', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить операцию', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'курс валют' }).waitFor()
  assert.equal(await page.getByLabel('Категория', { exact: true }).inputValue(), 'created')
  assert.equal(await page.getByLabel('Сумма', { exact: true }).inputValue(), '20')
  await page.getByRole('button', { name: 'Добавить операцию', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Операция добавлена' }).waitFor()
  assert.equal(creations, 1)
  assert.equal(attempts, 2)
  await page.getByRole('button', { name: 'Доход', exact: true }).click()
  await page.getByRole('button', { name: 'RUB', exact: true }).click()
  await page.getByLabel('Сумма', { exact: true }).fill('30')
  await page.getByRole('button', { name: 'Добавить операцию', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Операция добавлена' }).waitFor()
  for (const values of [[], ['0'], ['0', '0'], ['-20', '-10'], ['-5', '10', '-2']]) {
    series = values.map((value, index) => ({ date: `2026-10-0${index + 1}`, cumulative_rub: value }))
    await page.reload()
    await page.getByRole('heading', { name: 'Новая операция', exact: true }).waitFor()
    assert.equal(
      await page.locator('svg').evaluateAll((items) => items.some((item) => /NaN|Infinity/.test(item.outerHTML))),
      false,
    )
    if (values.length > 1) {
      const points = await page.locator('.balance-chart polyline').getAttribute('points')
      assert.ok(points)
      assert.ok(
        points.split(' ').every((point) => {
          const [x, y] = point.split(',').map(Number)
          return x >= 0 && x <= 600 && y >= 0 && y <= 180
        }),
      )
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  await page.goto('http://127.0.0.1:5191/#/finance/categories/old')
  await page.waitForRequest('**/categories/old/operations?**')
  await page.goto('http://127.0.0.1:5191/#/finance/categories/new')
  await page.getByText('Новая категория', { exact: true }).waitFor()
  releaseOld?.()
  await page.getByRole('link', { name: 'Назад к финансам' }).click()
  await page.goBack()
  await page.getByText('Новая категория', { exact: true }).waitFor()
  assert.equal(await page.getByText('Устаревший ответ', { exact: true }).count(), 0)
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage unavailable')
    }
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable')
    }
  })
  await page.goto('http://127.0.0.1:5191/#/finance')
  await page.getByRole('heading', { name: 'Новая операция', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'PASS: range validation, category retry, income, BYN failure, chart edges, stale replies, storage failure',
  )
} finally {
  await browser?.close()
  server.kill()
}
