import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Проверяем сохранение через настоящий FastAPI в явно выделенной тестовой БД.
// Ожидание: после перезагрузки формы и переносы отражают полные объекты публичного API.
const database = process.env.TRACKER_DATABASE_URL
assert.ok(database, 'Set TRACKER_DATABASE_URL to a dedicated integration database')
const databaseUrl = new URL(database.replace('postgresql+psycopg:', 'postgresql:'))
assert.equal(databaseUrl.pathname, '/react_e2e', 'Only the dedicated react_e2e database is allowed')
assert.ok(['127.0.0.1', 'localhost'].includes(databaseUrl.hostname), 'Only a local test database is allowed')
const base = 'http://127.0.0.1:8017'
try {
  await fetch(base)
  throw new Error('Port 8017 is occupied; refusing to use an unknown server')
} catch (error) {
  if (error.message.includes('occupied')) throw error
}
const server = spawn(
  process.env.TEST_PYTHON ?? 'python',
  ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8017'],
  { cwd: '..', env: process.env, stdio: 'inherit' },
)
/** @type {import('playwright-core').Browser | undefined} */
let browser
/** @param {string} path @returns {Promise<unknown>} */
async function read(path) {
  const response = await fetch(`${base}/api${path}`)
  assert.equal(response.status, 200)
  return response.json()
}
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Test API exited before startup')
    try {
      ready = (await fetch(`${base}/ready`)).ok
    } catch {
      /* Сервер ещё запускается. */
    }
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Test API must start')
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(7000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const suffix = Date.now().toString(36)
  const queueName = `Проверка ${suffix}`.toUpperCase()
  const taskName = `Задача ${suffix}`
  for (const status of ['Черновик', 'В работе']) {
    const response = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Сосед ${status} ${suffix}`, queue: queueName, status }),
    })
    assert.ok(response.ok)
  }
  await page.goto(base)
  await page.getByRole('button', { name: 'Новая задача', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill(taskName)
  await page.getByRole('dialog').getByLabel('Очередь', { exact: true }).fill(queueName)
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByRole('button', { name: queueName, exact: true }).click()
  await page.getByRole('button', { name: `Открыть задачу ${taskName}`, exact: true }).waitFor()
  let board = await read('/board')
  const task = board.tasks.find((item) => item.title === taskName)
  const queue = board.queues.find((item) => item.label === queueName)
  assert.deepEqual(task, {
    id: task.id,
    number: task.number,
    title: taskName,
    queue: queue.key,
    status: board.statuses[0].key,
    description: '',
    priority: 'low',
  })
  await page.getByRole('button', { name: `Открыть задачу ${taskName}`, exact: true }).click()
  await page.getByRole('dialog').getByLabel('Описание', { exact: true }).fill('Первая строка\nВторая строка')
  await page.getByRole('dialog').getByLabel('Приоритет').selectOption('critical')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const targetStatus = board.statuses[1]
  await page.getByRole('status').filter({ hasText: 'Загрузка…' }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: `Открыть задачу ${taskName}`, exact: true }).scrollIntoViewIfNeeded()

  const [moved] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/tasks/${task.id}/move`), { timeout: 7000 }),
    page
      .getByRole('button', { name: `Открыть задачу ${taskName}`, exact: true })
      .dragTo(page.locator(`[data-status="${targetStatus.key}"]`), { targetPosition: { x: 100, y: 20 } }),
  ])
  assert.ok(moved.ok())
  await page.reload()
  await page.locator(`[data-status="${targetStatus.key}"]`).getByText(taskName, { exact: true }).waitFor()
  board = await read('/board')
  assert.deepEqual(
    board.tasks.find((item) => item.id === task.id),
    { ...task, status: targetStatus.key, priority: 'critical', description: 'Первая строка\nВторая строка' },
  )
  await page.goto(`${base}/#/task/${task.id}`)
  assert.equal(
    await page.getByRole('dialog').getByLabel('Описание', { exact: true }).inputValue(),
    'Первая строка\nВторая строка',
  )
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'База знаний', exact: true }).click()
  await page.getByRole('button', { name: 'Новый блок', exact: true }).click()
  const blockName = `Материалы ${suffix}`
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill(blockName)
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByRole('heading', { name: blockName, exact: true }).waitFor()
  const topicNames = [`PostgreSQL ${suffix}`, `Транзакции ${suffix}`]
  const conceptName = `Атомарность ${suffix}`
  for (const name of topicNames) {
    await page.getByRole('button', { name: 'Новая тема', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill(name)
    await page.getByRole('dialog').getByLabel('Блок', { exact: true }).selectOption({ label: blockName })
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByRole('heading', { name, exact: true }).waitFor()
  }
  await page.getByRole('button', { name: `Добавить понятие в ${topicNames[0]}` }).click()
  await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill(conceptName)
  await page.getByRole('dialog').getByLabel('Описание', { exact: true }).fill('Полное выполнение\nИли откат')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: `Раскрыть понятие ${conceptName}`, exact: true }).waitFor()
  let knowledge = await read('/knowledge')
  const block = knowledge.blocks.find((item) => item.name === blockName)
  const sourceTopic = block.topics.find((item) => item.name === topicNames[0])
  const targetTopic = block.topics.find((item) => item.name === topicNames[1])
  const concept = sourceTopic.concepts[0]
  assert.deepEqual(concept, {
    id: concept.id,
    topic_id: sourceTopic.id,
    name: conceptName,
    description: 'Полное выполнение\nИли откат',
  })
  await page.getByRole('status').filter({ hasText: 'Загрузка…' }).waitFor({ state: 'hidden' })
  await page.locator('.concept-row').filter({ hasText: conceptName }).scrollIntoViewIfNeeded()
  await page.locator('.topic-card').evaluateAll(items => Promise.all(
    items.flatMap(item => item.getAnimations().map(animation => animation.finished)),
  ))
  const [conceptMoved] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(`/concepts/${concept.id}`) && response.request().method() === 'PATCH',
      { timeout: 7000 },
    ),
    page
      .locator('.concept-row')
      .filter({ hasText: conceptName })
      .dragTo(
        page.locator('.topic-card').filter({
          has: page.getByRole('heading', {
            name: topicNames[1],
            exact: true,
          }),
        }),
        { sourcePosition: { x: 5, y: 5 }, targetPosition: { x: 40, y: 20 } },
      ),
  ])
  assert.ok(conceptMoved.ok())
  await page.reload()
  const targetCard = page.locator('.topic-card').filter({
    has: page.getByRole('heading', {
      name: topicNames[1],
      exact: true,
    }),
  })
  await targetCard.getByRole('button', { name: `Раскрыть понятие ${conceptName}`, exact: true }).click()
  assert.equal(await targetCard.locator('.concept-desc').innerText(), 'Полное выполнение\nИли откат')
  assert.equal(await targetCard.locator('.concept-index').innerText(), '01')
  knowledge = await read('/knowledge')
  assert.deepEqual(
    knowledge.blocks.find((item) => item.id === block.id),
    {
      ...block,
      topics: [
        { ...sourceTopic, concepts: [] },
        { ...targetTopic, concepts: [{ ...concept, topic_id: targetTopic.id }] },
      ],
    },
  )
  await page.getByRole('link', { name: 'Финансы', exact: true }).click()
  await page.getByRole('heading', { name: 'Новая операция', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Диапазон…', exact: true }).click()
  await page.getByLabel('Начало периода').fill('2026-11-01')
  await page.getByLabel('Конец периода').fill('2026-11-30')
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/finance/dashboard?date_from=2026-11-01&date_to=2026-11-30'),
    ),
    page.getByRole('button', { name: 'Применить', exact: true }).click(),
  ])
  await page.getByRole('status').filter({ hasText: 'Загрузка…' }).waitFor({ state: 'hidden' })
  const categoryName = `Продукты ${suffix}`
  await page.getByLabel('Категория', { exact: true }).selectOption('__new__')
  await page.getByLabel('Название категории', { exact: true }).fill(categoryName)
  await page.getByLabel('Сумма', { exact: true }).fill('125.50')
  await page.getByLabel('Описание', { exact: true }).fill('Покупка продуктов')
  await page.getByLabel('Дата', { exact: true }).fill('2026-11-04')
  await page.getByRole('button', { name: 'Добавить операцию', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Операция добавлена' }).waitFor()
  const categories = await read('/finance/expense-categories')
  const category = categories.find((item) => item.name === categoryName)
  assert.deepEqual(category, { id: category.id, kind: 'expense', name: categoryName })
  const operationsPath = `/finance/categories/${category.id}/operations?date_from=2026-11-01&date_to=2026-11-30`
  const operations = await read(operationsPath)
  assert.equal(operations.length, 1)
  const operation = operations[0]
  assert.deepEqual(operation, {
    id: operation.id,
    kind: 'expense',
    category_id: category.id,
    amount: '125.50',
    currency: 'RUB',
    amount_rub: '125.50',
    rate: '1.000000',
    date: '2026-11-04',
    description: 'Покупка продуктов',
  })
  await page.getByRole('link', { name: `Операции категории ${categoryName}`, exact: true }).click()
  await page.getByRole('button', { name: 'Редактировать описание', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Описание', { exact: true }).fill('Изменённое описание')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText('Изменённое описание', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Изменённое описание', { exact: true }).waitFor()
  assert.deepEqual(await read(operationsPath), [{ ...operation, description: 'Изменённое описание' }])
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('financeRange'))), {
    preset: 'custom',
    from: '2026-11-01',
    to: '2026-11-30',
  })
  await mkdir('shots', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [name, hash, heading] of [
      ['finance', '#/finance', 'Финансы'],
      ['board', '#', 'Задачи'],
      ['knowledge', '#/knowledge', 'База знаний'],
    ]) {
      await page.goto(`${base}/${hash}`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      await page.getByRole('status').filter({ hasText: 'Загрузка…' }).waitFor({ state: 'hidden' })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no overflow`)
      await page.screenshot({ path: `shots/${name}-${width}.png`, fullPage: true, animations: 'disabled' })
    }
  }
  assert.deepEqual(errors, [])
  console.log('PASS: real API persistence, board drag, concept move, finance description, reload and both widths')
} catch (error) {
  console.error(error)
  const failedPage = browser?.contexts()[0]?.pages()[0]
  if (failedPage) {
    console.error(await failedPage.locator('body').innerText())
    console.error(
      await failedPage.locator('dialog').evaluateAll((items) =>
        items.map((item) => ({
          html: item.outerHTML,
          open: item.open,
          display: getComputedStyle(item).display,
        })),
      ),
    )
  }
  process.exitCode = 1
} finally {
  await browser?.close()
  server.kill()
}
