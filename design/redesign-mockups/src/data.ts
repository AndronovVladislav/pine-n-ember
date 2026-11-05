export type Direction = 'forest' | 'desk' | 'ember' | 'refined'
export type Section = 'finance' | 'board' | 'knowledge'

export const directions: { id: Direction; name: string; subtitle: string; description: string }[] = [
  {
    id: 'forest',
    name: 'Тихий лес',
    subtitle: 'Знакомый, но собраннее',
    description: 'Привычные вкладки и карточки. Больше воздуха, яснее иерархия, меньше визуального шума.',
  },
  {
    id: 'desk',
    name: 'Рабочий стол',
    subtitle: 'Всё под рукой',
    description: 'Боковая навигация, плотные списки и разделённые панели. Для долгой работы и большого объёма записей.',
  },
  {
    id: 'ember',
    name: 'Тёплый фокус',
    subtitle: 'Главное — на первом плане',
    description: 'Крупные акценты и асимметричная компоновка. Сначала суть, затем подробности.',
  },
]

export const sections: { id: Section; name: string; description: string }[] = [
  { id: 'board', name: 'Трекер', description: 'Задачи, очереди и движение от идеи к результату' },
  { id: 'knowledge', name: 'База знаний', description: 'Блоки, темы и понятия, к которым хочется возвращаться' },
  { id: 'finance', name: 'Финансы', description: 'Доходы, расходы и баланс за выбранный период' },
]

export const statuses = ['Черновик', 'В работе', 'На проверке', 'На паузе', 'Готово']
export const queues = ['PET PROJECTS', 'ЛИЧНОЕ', 'ИДЕИ']
export type Task = { id: string; title: string; status: number; priority: 'Высокий' | 'Средний' | 'Низкий' }
export const tasks: Task[] = [
  { id: 'DEMO-01', title: 'Собрать идеи для портфолио', status: 0, priority: 'Низкий' },
  { id: 'DEMO-02', title: 'Продумать структуру заметок', status: 0, priority: 'Средний' },
  { id: 'DEMO-03', title: 'Обновить главную страницу', status: 1, priority: 'Высокий' },
  { id: 'DEMO-04', title: 'Проверить адаптивную сетку', status: 1, priority: 'Средний' },
  { id: 'DEMO-05', title: 'Упростить форму добавления', status: 1, priority: 'Низкий' },
  { id: 'DEMO-06', title: 'Проверить контрастность', status: 2, priority: 'Высокий' },
  { id: 'DEMO-07', title: 'Выбрать шрифт для заголовков', status: 3, priority: 'Низкий' },
  { id: 'DEMO-08', title: 'Разобрать входящие', status: 4, priority: 'Низкий' },
  { id: 'DEMO-09', title: 'Настроить резервные копии', status: 4, priority: 'Средний' },
]

export type Category = { name: string; amount: number; percent: number; color: string; count: number }
export const expenses: Category[] = [
  { name: 'Продукты', amount: 18400, percent: 42, color: '#e8b18d', count: 12 },
  { name: 'Дом', amount: 12500, percent: 29, color: '#a6b898', count: 3 },
  { name: 'Транспорт', amount: 6800, percent: 15, color: '#cbbf8f', count: 8 },
  { name: 'Другое', amount: 6100, percent: 14, color: '#7fa69a', count: 6 },
]
export const incomes: Category[] = [
  { name: 'Зарплата', amount: 85000, percent: 85, color: '#a6b898', count: 1 },
  { name: 'Проекты', amount: 15000, percent: 15, color: '#e8b18d', count: 2 },
]
export const operations = [
  { title: 'Продукты на неделю', date: '4 ноября', amount: '−3 200 ₽', currency: 'RUB' },
  { title: 'Овощи и фрукты', date: '3 ноября', amount: '−1 480 ₽', currency: 'BYN → RUB' },
  { title: 'Покупки к ужину', date: '2 ноября', amount: '−2 160 ₽', currency: 'RUB' },
]
export const balance = [0, 85000, 82500, 78600, 74200, 70000, 85000, 82100, 76000, 72400, 68100, 56200]
export const money = (value: number): string => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`

export type Topic = { name: string; block: string; count: number; summary: string; concepts: string[] }
export const topics: Topic[] = [
  {
    name: 'PostgreSQL',
    block: 'Разработка',
    count: 8,
    summary: 'Как устроены данные, индексы и транзакции.',
    concepts: ['Индексы', 'Транзакции', 'План запроса'],
  },
  {
    name: 'Python',
    block: 'Разработка',
    count: 6,
    summary: 'Язык, типы и понятные границы модулей.',
    concepts: ['Генераторы', 'Протоколы', 'Контекстные менеджеры'],
  },
  {
    name: 'Интерфейсы',
    block: 'Дизайн',
    count: 5,
    summary: 'Типографика, композиция и доступность.',
    concepts: ['Визуальная иерархия', 'Контраст', 'Сетка'],
  },
  {
    name: 'Личные финансы',
    block: 'Повседневное',
    count: 4,
    summary: 'Простые принципы учёта и планирования.',
    concepts: ['Резерв', 'Категории расходов', 'Период учёта'],
  },
]

const conceptDescriptions: Record<string, string> = {
  Транзакции: 'Несколько изменений выполняются как одно целое: либо сохраняются все, либо ни одно.',
  'План запроса': 'Порядок действий, выбранный базой данных для выполнения запроса.',
  Генераторы: 'Функции, которые возвращают значения постепенно и сохраняют своё состояние между вызовами.',
  Протоколы: 'Описание ожидаемых методов и свойств объекта без требования общего базового класса.',
  'Контекстные менеджеры': 'Управляют входом и выходом из блока with: например, освобождают открытый ресурс.',
  'Визуальная иерархия': 'Размер, контраст и положение элементов показывают, что читать и делать в первую очередь.',
  Контраст: 'Различие между текстом и фоном, от которого зависит читаемость интерфейса.',
  Сетка: 'Общие направляющие, которые помогают выравнивать элементы и выдерживать интервалы.',
  Резерв: 'Деньги на непредвиденные расходы, которые хранятся отдельно от повседневного бюджета.',
  'Категории расходов': 'Группы операций, по которым удобно понимать, на что уходят деньги.',
  'Период учёта': 'Диапазон дат, за который сравниваются доходы, расходы и их разница.',
}

export function conceptText(title: string): string[] {
  return title === 'Индексы' ? conceptBody : [conceptDescriptions[title]]
}

export const conceptBody = [
  'Индекс — вспомогательная структура данных, которая помогает находить строки без полного просмотра таблицы.',
  'B-tree подходит для сравнений и диапазонов. Это стандартный тип индекса в PostgreSQL: ' +
    'хороший первый выбор для большинства запросов.',
  'Индекс ускоряет чтение, но занимает место и увеличивает стоимость записи. ' +
    'Создавать его стоит под конкретный запрос, а результат проверять через EXPLAIN ANALYZE.',
]
