import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

// Проверка статичных кадров средствами Stageshow на двух ширинах.
// Ожидание: три экрана согласованного макета проходят визуальные проверки --gate.
const run = promisify(execFile)
const base = process.env.MOCKUP_URL ?? 'http://127.0.0.1:5177'
const jobs = ['refined'].flatMap((direction) =>
  ['finance', 'board', 'knowledge'].flatMap((section) => [1440, 390].map((width) => ({ direction, section, width }))),
)
await mkdir('shots', { recursive: true })
const failures = []
async function worker() {
  for (let job; (job = jobs.shift()); ) {
    const { direction, section, width } = job
    const name = `rehearsal-${direction}-${section}-${width}`
    const args = [
      'tools/film.mjs',
      `${base}/?direction=${direction}&section=${section}&capture=1`,
      '--still',
      '--gate',
      '--width',
      String(width),
      '--out',
      `shots/${name}.png`,
      '--report',
      `shots/${name}.json`,
    ]
    try {
      const { stdout, stderr } = await run(process.execPath, args, { timeout: 60000 })
      await writeFile(`shots/${name}.log`, stdout + stderr)
      assert.match(stdout, /rehearsal passed/)
      console.log(`PASS: ${direction}/${section}/${width}`)
    } catch (error) {
      failures.push(name)
      const output = (error.stdout ?? '') + (error.stderr ?? '') + error.message
      await writeFile(`shots/${name}.log`, output)
      console.error(`FAIL: ${name}\n${output}`)
    }
  }
}
await Promise.all([worker(), worker(), worker()])
assert.deepEqual(failures, [], 'Stageshow rehearsal failures')
console.log('PASS: 6 Stageshow still rehearsals')
