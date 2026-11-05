import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

/**
 * Наблюдаем настоящие браузерные анимации покадрово, не подменяя их выполнение.
 * Ожидание: короткий переход замечен даже при медленном обмене между тестом и браузером.
 * @param {import('playwright-core').Page} page
 * @param {string} selector
 * @returns {Promise<void>}
 */
async function observe(page, selector) {
  await page.evaluate((selector) => {
    window.motionFrames = []
    const epoch = (window.motionEpoch = (window.motionEpoch ?? 0) + 1)
    const record = () => {
      if (window.motionEpoch !== epoch) return
      const items = [...document.querySelectorAll(selector)]
      window.motionFrames.push(
        items.map((node) => ({
          clipped: (() => {
            const parent = node.closest('.cards')
            if (!parent || !node.getAnimations().length) return false
            const style = getComputedStyle(parent)
            if (style.overflowX === 'visible' && style.overflowY === 'visible') return false
            const rect = node.getBoundingClientRect()
            const clip = parent.getBoundingClientRect()
            return (
              rect.left < clip.left - 1 ||
              rect.right > clip.right + 1 ||
              rect.top < clip.top - 1 ||
              rect.bottom > clip.bottom + 1
            )
          })(),
          text: node.textContent,
          animations: node.getAnimations({ subtree: true }).map((animation) => ({
            duration: Number(animation.effect.getTiming().duration),
            frames: animation.effect.getKeyframes(),
          })),
        })),
      )
      if (window.motionFrames.length < 180) requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  }, selector)
}

/**
 * Сохраняем кадры перехода для визуальной проверки, не используем задержки в проверках результата.
 * Ожидание: по запросу остаются начальные, промежуточные и конечные кадры на обеих ширинах.
 * @param {import('playwright-core').Page} page
 * @param {string} selector
 * @param {string} name
 * @returns {Promise<void>}
 */
async function capture(page, selector, name) {
  if (!process.env.MOTION_CAPTURE) return
  await mkdir('shots', { recursive: true })
  for (let frame = 0; frame < 4; frame++) {
    const clip = await page.locator(selector).boundingBox()
    await page.screenshot({
      path: `shots/motion-${name}-${page.viewportSize().width}-${frame}.png`,
      clip,
      animations: 'allow',
    })
    if (frame < 3) await page.waitForTimeout(50)
  }
}

/**
 * Проверяем движение после изменения данных и отсутствие потери ввода при обновлении.
 * Ожидание: анимируются изменённые карточки и суммы, но не повторные неизменные данные.
 * @param {import('playwright-core').Page} page
 * @param {'board' | 'finance'} scenario
 * @param {string} base
 * @returns {Promise<void>}
 */
export async function testDataMotion(page, scenario, base) {
  const board = {
    statuses: [
      { key: 'draft', label: 'Черновик', color: '#6b8f74' },
      { key: 'done', label: 'Готово', color: '#4f6e58' },
    ],
    queues: [{ key: 'pet', label: 'PET PROJECTS', bg: '#1f3b2c', text: '#dce9d6', position: 0 }],
    tasks: [
      {
        id: 'first',
        number: 1,
        title: 'Первая задача',
        queue: 'pet',
        status: 'draft',
        priority: 'low',
        description: '',
      },
      {
        id: 'second',
        number: 2,
        title: 'Вторая задача',
        queue: 'pet',
        status: 'draft',
        priority: 'lowest',
        description: '',
      },
    ],
  }
  let dashboards = 0
  let moves = 0
  /** @type {(() => void) | undefined} */
  let releaseDashboard
  /** @type {(() => void) | undefined} */
  let releaseMove
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/board') return route.fulfill({ json: board })
    if (path === '/api/tasks' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      assert.deepEqual(payload, {
        title: 'Новая карточка',
        queue: 'PET PROJECTS',
        status: 'Черновик',
        priority: 'critical',
      })
      const task = { ...board.tasks[0], id: 'new', number: 3, title: payload.title, priority: payload.priority }
      board.tasks.push(task)
      return route.fulfill({ json: task })
    }
    if (path === '/api/tasks/first/move') {
      moves++
      await new Promise((resolve) => {
        releaseMove = resolve
      })
      if (moves === 2) return route.fulfill({ status: 500, json: { detail: 'Write failed' } })
      board.tasks[0].status = request.postDataJSON().status
      return route.fulfill({ json: board.tasks[0] })
    }
    if (path === '/api/finance/expense-categories')
      return route.fulfill({ json: [{ id: 'expense', name: 'Продукты', kind: 'expense' }] })
    if (path === '/api/finance/income-categories') return route.fulfill({ json: [] })
    if (path === '/api/finance/dashboard') {
      dashboards++
      if (dashboards > 1)
        await new Promise((resolve) => {
          releaseDashboard = resolve
        })
      return route.fulfill({
        json: {
          balance_rub: dashboards === 1 ? '100' : '300',
          income_total_rub: dashboards === 1 ? '200' : '400',
          expense_total_rub: '100',
          expense_by_category: [{ category_id: 'expense', category_name: 'Продукты', amount_rub: '100' }],
          income_by_category: [],
          recent_operations: [],
          balance_series: [
            { date: '2026-11-01', cumulative_rub: '-100' },
            { date: '2026-11-02', cumulative_rub: dashboards === 1 ? '100' : '300' },
          ],
        },
      })
    }
    throw new Error(`Unexpected request: ${request.method()} ${path}`)
  })
  await page.goto(`${base}/${scenario === 'finance' ? '#/finance' : ''}`)
  if (scenario === 'board') {
    await page.getByText('Первая задача', { exact: true }).waitFor()
    assert.equal(await page.locator('.column-count').count(), 0)
    await page.getByRole('button', { name: 'Новая задача', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill('Новая карточка')
    await page.getByRole('dialog').getByLabel('Приоритет', { exact: true }).selectOption('critical')
    await observe(page, '.task-wrap')
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByText('Новая карточка', { exact: true }).waitFor()
    assert.ok(
      await page.evaluate(() =>
        window.motionFrames.some((frame) => frame.filter((item) => item.animations.length > 0).length >= 2),
      ),
      'New card and its neighbors must animate together',
    )
    await observe(page, '.task-wrap')
    const source = page.getByRole('button', { name: 'Открыть задачу Первая задача', exact: true })
    await Promise.all([
      page.waitForRequest('**/tasks/first/move'),
      source.dragTo(page.locator('[data-status="done"]'), { targetPosition: { x: 100, y: 20 } }),
    ])
    assert.equal(await page.locator('[data-status="draft"]').getByText('Первая задача', { exact: true }).count(), 1)
    releaseMove()
    await page.locator('[data-status="done"]').getByText('Первая задача', { exact: true }).waitFor()
    await page.waitForFunction(() =>
      window.motionFrames.some((frame) =>
        frame.some((item) => item.text.includes('Первая задача') && item.animations.length),
      ),
    )
    assert.equal(
      await page.evaluate(() => window.motionFrames.some((frame) => frame.some((item) => item.clipped))),
      false,
      'Moving cards must not be cut by a column scrollport',
    )
    await capture(page, '.board', 'board-transfer')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.task-wrap')].every((node) => node.getAnimations().length === 0),
    )
    assert.equal(
      await page.locator('.task-wrap').evaluateAll((items) => items.some((item) => item.getAnimations().length)),
      false,
    )
    await Promise.all([
      page.waitForRequest('**/tasks/first/move'),
      source.dragTo(page.locator('[data-status="draft"]'), { targetPosition: { x: 100, y: 20 } }),
    ])
    releaseMove()
    await page.getByRole('alert').waitFor()
    assert.equal(await page.locator('[data-status="done"]').getByText('Первая задача', { exact: true }).count(), 1)
    assert.deepEqual(board.tasks[0], {
      id: 'first',
      number: 1,
      title: 'Первая задача',
      queue: 'pet',
      status: 'done',
      priority: 'low',
      description: '',
    })
  } else {
    await page.getByRole('heading', { name: 'Новая операция', exact: true }).waitFor()
    await page.getByLabel('Сумма', { exact: true }).fill('17.50')
    await page.getByLabel('Описание', { exact: true }).fill('Несохранённый ввод')
    await observe(page, '.fin-overview strong, .balance-chart svg')
    await Promise.all([
      page.waitForRequest('**/finance/dashboard?**'),
      page.getByRole('button', { name: '30 дней', exact: true }).click(),
    ])
    assert.equal(await page.locator('.fin-overview').count(), 1, 'Keep old results while loading the new period')
    await page.waitForFunction(() => document.querySelector('.fin-overview')?.getAttribute('aria-busy') === 'true')
    assert.equal(await page.locator('.fin-overview').getAttribute('aria-busy'), 'true')
    assert.equal(await page.getByLabel('Сумма', { exact: true }).inputValue(), '17.50')
    releaseDashboard()
    await page.waitForFunction(() => document.querySelector('.fin-overview')?.getAttribute('aria-busy') === 'false')
    assert.equal(await page.getByLabel('Описание', { exact: true }).inputValue(), 'Несохранённый ввод')
    await page.waitForFunction(() =>
      window.motionFrames.some((frame) => frame.filter((item) => item.animations.length).length >= 2),
    )
    await capture(page, '.fin-overview', 'finance-values')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.fin-overview').evaluate(async (node) => {
      await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})))
    })
    assert.ok((await page.locator('.fin-balance strong').innerText()).includes('300'))
    assert.equal(
      await page.locator('.fin-overview').evaluate((node) => node.getAnimations({ subtree: true }).length),
      0,
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await observe(page, '.fin-overview strong, .balance-chart')
    await Promise.all([
      page.waitForRequest('**/finance/dashboard?**'),
      page.getByRole('button', { name: 'Месяц', exact: true }).click(),
    ])
    releaseDashboard()
    await page.waitForFunction(() => document.querySelector('.fin-overview')?.getAttribute('aria-busy') === 'false')
    await page.evaluate(() => new Promise(requestAnimationFrame))
    assert.equal(
      await page.evaluate(() => window.motionFrames.some((frame) => frame.some((item) => item.animations.length))),
      false,
      'Unchanged values and series must not replay their animation',
    )
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
}
