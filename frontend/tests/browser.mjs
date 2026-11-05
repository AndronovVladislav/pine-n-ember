import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

// Проверяем рабочий интерфейс через браузер и публичную HTTP-границу.
// Ожидание: данные и записи идут через API, а не через демонстрационные обработчики.
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
  const page = await browser.newPage()
  page.setDefaultTimeout(5000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const board = {
    statuses: [
      { key: 'draft', label: 'Черновик', color: '#6b8f74' },
      { key: 'progress', label: 'В работе', color: '#ff9e64' },
      { key: 'done', label: 'Готово', color: '#4f6e58' },
    ],
    queues: [{ key: 'pet', label: 'PET PROJECTS', bg: '#1f3b2c', text: '#dce9d6', position: 0 }],
    tasks: [
      {
        id: 'task-1',
        number: 7,
        title: 'Первая задача',
        queue: 'pet',
        status: 'draft',
        description: 'Описание задачи',
        priority: 'high',
      },
    ],
  }
  const knowledge = {
    blocks: [
      {
        id: 'block-1',
        name: 'Разработка',
        position: 0,
        topics: [
          {
            id: 'topic-1',
            block_id: 'block-1',
            name: 'PostgreSQL',
            description: 'База данных',
            concepts: [
              { id: 'concept-1', topic_id: 'topic-1', name: 'Индексы', description: 'Первая строка\nВторая строка' },
            ],
          },
        ],
      },
    ],
    topics: [],
  }
  const expenseCategories = [{ id: 'expense-1', name: 'Продукты', kind: 'expense' }]
  const incomeCategories = [{ id: 'income-1', name: 'Зарплата', kind: 'income' }]
  const operations = []
  let expenseAttempts = 0
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/finance/expense-categories') return route.fulfill({ json: expenseCategories })
    if (path === '/api/finance/income-categories') return route.fulfill({ json: incomeCategories })
    if (path === '/api/finance/dashboard')
      return route.fulfill({
        json: {
          income_total_rub: '0',
          expense_total_rub: operations.length ? '125.50' : '10',
          balance_rub: '-125.50',
          expense_by_category: [{ category_id: 'expense-1', category_name: 'Продукты', amount_rub: '125.50' }],
          income_by_category: [],
          balance_series: [{ date: '2026-11-04', cumulative_rub: '-125.50' }],
          recent_operations: [],
        },
      })
    if (path === '/api/finance/expenses') {
      expenseAttempts++
      if (expenseAttempts === 1) return route.fulfill({ status: 502, json: { detail: 'Unavailable' } })
      const payload = request.postDataJSON()
      assert.deepEqual(payload, {
        category_id: 'expense-1',
        amount: '125.50',
        currency: 'RUB',
        date: '2026-11-04',
        description: 'Покупка',
      })
      const operation = { id: 'operation-1', kind: 'expense', ...payload, amount_rub: '125.50', rate: '1' }
      operations.push(operation)
      return route.fulfill({ json: operation })
    }
    if (path === '/api/finance/categories/expense-1/operations') return route.fulfill({ json: operations })
    if (path === '/api/knowledge') return route.fulfill({ json: knowledge })
    if (path === '/api/topics/topic-1/concepts' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      assert.deepEqual(payload, { name: 'Транзакции', description: 'Строка 1\nСтрока 2' })
      const concept = { id: 'concept-2', topic_id: 'topic-1', ...payload }
      knowledge.blocks[0].topics[0].concepts.push(concept)
      return route.fulfill({ json: concept })
    }
    if (path === '/api/board') return route.fulfill({ json: board })
    if (path === '/api/tasks' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      assert.deepEqual(payload, {
        title: 'Новая рабочая задача',
        queue: 'PET PROJECTS',
        status: 'Черновик',
        priority: 'low',
      })
      const task = {
        id: 'task-2',
        number: 8,
        title: payload.title,
        queue: 'pet',
        status: 'draft',
        description: '',
        priority: payload.priority,
      }
      board.tasks.push(task)
      return route.fulfill({ json: task })
    }
    throw new Error(`Unexpected request: ${request.method()} ${path}`)
  })
  await page.goto('http://127.0.0.1:5191')
  await page.getByText('Первая задача', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Новая задача', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill('Новая рабочая задача')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByText('Новая рабочая задача', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Новая рабочая задача', { exact: true }).waitFor()
  await page.getByRole('link', { name: 'База знаний', exact: true }).click()
  await page.getByText('PostgreSQL', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Раскрыть понятие Индексы' }).click()
  await page.getByText('Первая строка\nВторая строка', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Добавить понятие в PostgreSQL' }).click()
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill('Транзакции')
  assert.equal(
    await page
      .getByRole('dialog')
      .getByLabel('Описание', { exact: true })
      .evaluate((field) => field.tagName),
    'TEXTAREA',
  )
  await page.getByRole('dialog').getByLabel('Описание', { exact: true }).fill('Строка 1\nСтрока 2')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByRole('button', { name: 'Раскрыть понятие Транзакции' }).waitFor()
  assert.deepEqual(await page.locator('.concept-index').allTextContents(), ['01', '02'])
  await page.reload()
  await page.getByRole('button', { name: 'Раскрыть понятие Транзакции' }).click()
  await page.getByText('Строка 1\nСтрока 2', { exact: true }).waitFor()
  assert.equal(
    await page.getByText('Строка 1\nСтрока 2', { exact: true }).evaluate((field) => getComputedStyle(field).whiteSpace),
    'pre-wrap',
  )
  await page.getByRole('link', { name: 'Финансы', exact: true }).click()
  await page.getByRole('heading', { name: 'Доходы по категориям' }).waitFor()
  assert.deepEqual(await page.locator('.fin-details h2').allTextContents(), [
    'Расходы по категориям',
    'Доходы по категориям',
    'Динамика баланса',
  ])
  await page.getByLabel('Сумма', { exact: true }).fill('125.50')
  await page.getByLabel('Дата', { exact: true }).fill('2026-11-04')
  await page.getByLabel('Описание', { exact: true }).fill('Покупка')
  await page.getByRole('button', { name: 'Добавить операцию', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Не удалось получить курс' }).waitFor()
  assert.equal(await page.getByLabel('Сумма', { exact: true }).inputValue(), '125.50')
  await page.getByRole('button', { name: 'Добавить операцию', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Операция добавлена' }).waitFor()
  await page.getByRole('link', { name: 'Операции категории Продукты' }).click()
  await page.getByText('Покупка', { exact: true }).waitFor()
  assert.equal(operations.length, 1)
  assert.deepEqual(errors, [])
  console.log('PASS: board, multiline knowledge, finance save/retry and category navigation')
} finally {
  await browser?.close()
  server.kill()
}
