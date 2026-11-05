export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'lowest'
export interface Status {
  key: string
  label: string
  color: string
}
export interface Queue {
  key: string
  label: string
  bg: string
  text: string
  position: number
}
export interface Task {
  id: string
  number: number
  title: string
  queue: string | null
  status: string
  description: string
  priority: Priority
}
export interface BoardData {
  statuses: Status[]
  queues: Queue[]
  tasks: Task[]
}
export interface Concept {
  id: string
  topic_id: string
  name: string
  description: string
}
export interface Topic {
  id: string
  block_id: string | null
  name: string
  description: string
  concepts: Concept[]
}
export interface Block {
  id: string
  name: string
  position: number
  topics: Topic[]
}
export interface KnowledgeData {
  blocks: Block[]
  topics: Topic[]
}
export type Kind = 'expense' | 'income'
export interface Category {
  id: string
  name: string
  kind: Kind
}
export interface Breakdown {
  category_id: string
  category_name: string
  amount_rub: string | number
}
export interface BalancePoint {
  date: string
  cumulative_rub: string | number
}
export interface Dashboard {
  income_total_rub: string | number
  expense_total_rub: string | number
  balance_rub: string | number
  expense_by_category: Breakdown[]
  income_by_category: Breakdown[]
  balance_series: BalancePoint[]
}
export interface Operation {
  id: string
  kind: Kind
  category_id: string
  amount: string | number
  currency: 'RUB' | 'BYN'
  amount_rub: string | number
  rate: string | number
  date: string
  description: string | null
}

export class ApiError extends Error {
  constructor(public status: number) {
    super(`HTTP request failed: ${status}`)
  }
}

export async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new ApiError(response.status)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
