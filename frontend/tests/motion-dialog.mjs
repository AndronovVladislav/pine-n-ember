import assert from 'node:assert/strict'

/**
 * Проверяем сохранение формы и отмену переходов при ошибке, повторе и смене страницы.
 * Ожидание: запрос один, ошибка сохраняет ввод, закрытие завершает переход и возвращает фокус.
 * @param {import('playwright-core').Page} page
 * @param {string} base
 * @returns {Promise<void>}
 */
export async function testDialogInterruptions(page, base) {
  let attempts = 0
  /** @type {(() => void) | undefined} */
  let releaseSave
  const board = {
    statuses: [{ key: 'draft', label: 'Черновик', color: '#6b8f74' }],
    queues: [{ key: 'pet', label: 'PET PROJECTS', bg: '#1f3b2c', text: '#dce9d6', position: 0 }],
    tasks: [],
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/board') return route.fulfill({ json: board })
    if (path === '/api/knowledge') return route.fulfill({ json: { blocks: [], topics: [] } })
    if (
      (path === '/api/tasks' && request.method() === 'POST') ||
      (path === '/api/tasks/saved' && request.method() === 'PATCH')
    ) {
      attempts++
      assert.deepEqual(request.postDataJSON(), {
        title: 'Проверка сохранения',
        queue: 'PET PROJECTS',
        status: 'Черновик',
        priority: 'low',
        ...(request.method() === 'PATCH' ? { description: '' } : {}),
      })
      await new Promise((resolve) => {
        releaseSave = resolve
      })
      if (attempts === 1) return route.fulfill({ status: 500, json: { detail: 'Save failed' } })
      const task = {
        id: 'saved',
        number: 1,
        title: 'Проверка сохранения',
        queue: 'pet',
        status: 'draft',
        priority: 'low',
        description: '',
      }
      if (request.method() === 'POST') board.tasks.push(task)
      else board.tasks[0] = task
      return route.fulfill({ json: task })
    }
    throw new Error(`Unexpected request: ${request.method()} ${path}`)
  })
  await page.goto(base)
  const open = page.getByRole('button', { name: 'Новая задача', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название', { exact: true }).fill('Проверка сохранения')
  const submit = page.getByRole('button', { name: 'Добавить', exact: true })
  const idleBounds = await submit.boundingBox()
  await Promise.all([page.waitForRequest('**/api/tasks'), submit.click()])
  await page.waitForFunction(() => document.querySelector('dialog fieldset')?.disabled)
  const pending = page.getByRole('button', { name: 'Сохранение…', exact: true })
  const pendingBounds = await pending.boundingBox()
  assert.equal(idleBounds.width, pendingBounds.width, 'Pending labels must not resize the button')
  await page.locator('dialog form').evaluate((form) => {
    form.requestSubmit()
    form.requestSubmit()
  })
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(), 1)
  assert.equal(await dialog.getAttribute('data-closing'), null)
  assert.equal(attempts, 1)
  releaseSave()
  await dialog.getByRole('alert').waitFor()
  assert.equal(await dialog.getByLabel('Название', { exact: true }).inputValue(), 'Проверка сохранения')
  await Promise.all([page.waitForRequest('**/api/tasks'), submit.click()])
  releaseSave()
  await page.waitForFunction(() => document.querySelector('dialog')?.dataset.closing === 'true')
  assert.equal(await dialog.locator('fieldset').evaluate((fieldset) => fieldset.disabled), true)
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(attempts, 2)
  assert.equal(await open.evaluate((node) => node === document.activeElement), true)
  await open.click()
  await page.evaluate(() => {
    location.hash = '#/knowledge'
  })
  await page.getByRole('heading', { name: 'База знаний', exact: true }).waitFor()
  assert.equal(await dialog.count(), 0)
  assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})))
  })
  assert.equal(await page.evaluate(() => location.hash), '#/knowledge')
  await page.getByRole('link', { name: 'Трекер', exact: true }).click()
  await open.click()
  await page.keyboard.press('Escape')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await open.evaluate((node) => node === document.activeElement), true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await open.click()
  await page.mouse.click(1, 1)
  await page.waitForFunction(() => document.querySelector('dialog')?.dataset.closing === 'true')
  await dialog.waitFor({ state: 'hidden' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Открыть задачу Проверка сохранения', exact: true }).click()
  await Promise.all([
    page.waitForRequest('**/api/tasks/saved'),
    page.getByRole('button', { name: 'Сохранить', exact: true }).click(),
  ])
  await page.evaluate(() => {
    location.hash = '#/knowledge'
  })
  await page.getByRole('heading', { name: 'База знаний', exact: true }).waitFor()
  const refresh = page.waitForResponse('**/api/board')
  releaseSave()
  await (await refresh).finished()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(
    await page.evaluate(() => location.hash),
    '#/knowledge',
    'A disposed dialog must not navigate after saving',
  )
}
