import { NextResponse } from "next/server"
import { openai } from "@/lib/openai"
import { prisma } from "@/lib/db"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"


const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

// 📦 Подгрузка товаров
function loadProducts() {
  const filePath = path.join(process.cwd(), "public", "dealer.json")
  const data = fs.readFileSync(filePath, "utf8")
  return JSON.parse(data)
}

export async function POST(req: Request) {
  try {
    // ✅ Поддержка FormData (файлы + текст)
let question = ""
let file: File | null = null

const contentType = req.headers.get("content-type") || ""




if (contentType.includes("multipart/form-data")) {
  const formData = await req.formData()
  question = (formData.get("question") as string) || ""
  file = formData.get("file") as File | null

  if (file) {
    console.log(`📎 Прикреплён файл: ${file.name}`)

    // 📂 сохраняем файл во временную директорию
    const uploadDir = path.join(process.cwd(), "tmp", "uploads")
    fs.mkdirSync(uploadDir, { recursive: true })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const savePath = path.join(uploadDir, file.name)
    fs.writeFileSync(savePath, buffer)

    // 🧩 Определяем расширение и извлекаем текст
    const ext = path.extname(file.name).toLowerCase()
    let extractedText = ""

    try {
      if (ext === ".txt") {
        extractedText = buffer.toString("utf8")
      } else if (ext === ".pdf") {
        // ✅ Исправленный динамический импорт pdf-parse
        const pdfParseModule = await import("pdf-parse")
        const pdfParse = (pdfParseModule as any).default || pdfParseModule
        const data = await pdfParse(buffer)
        extractedText = data.text
      } else if (ext === ".docx") {
        // ✅ Исправленный динамический импорт mammoth
        const mammothModule = await import("mammoth")
        const mammoth = (mammothModule as any).default || mammothModule
        const result = await mammoth.extractRawText({ buffer })
        extractedText = result.value
      } else {
        console.warn("⚠️ Неподдерживаемый тип файла:", ext)
      }
    } catch (err) {
      console.error("❌ Ошибка при парсинге файла:", err)
    }

    // 🔍 Добавляем содержимое файла в вопрос к GPT
    if (extractedText) {
      const preview = extractedText.slice(0, 4000)
      question += `\n\n📎 Содержимое файла (${file.name}):\n${preview}`
      console.log(`📄 Извлечено ${extractedText.length} символов из ${file.name}`)
    }
  }



} else {
  // старый вариант JSON-запроса
  const body = await req.json().catch(() => ({}))
  question = body.question || ""
}

if (!question && !file) {
  return NextResponse.json({ error: "Пустой запрос" }, { status: 400 })
}

const cookieStore = await cookies()


    // 🎯 Сессия
    let sessionId = cookieStore.get("sessionId")?.value
    let isNewSession = false
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      isNewSession = true
    }

    console.log(`💬 Новый вопрос: "${question}"`)

    // 🧠 1️⃣ Intent
    const intentRes = await fetch(`${BASE_URL}/api/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    })
    const intent = await intentRes.json()
    console.log("🎯 Распознанный intent:", intent)

    // 💬 2️⃣ История сообщений
    const history = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 20,
    })
    const conversationHistory: ChatCompletionMessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

    // 🧩 3️⃣ Сборка
    let build = await prisma.sessionBuild.findUnique({ where: { sessionId } })
    if (!build)
      build = await prisma.sessionBuild.create({ data: { sessionId, data: {} } })
    let buildData = build.data as any

    let responseText = ""

    // ⚙️ 4️⃣ Уточнение
    if (intent.needs_clarification && intent.clarification_prompt) {
      const answer = intent.clarification_prompt
      await saveChat(sessionId, question, answer, isNewSession)
      return NextResponse.json({ answer })
    }

// 🕓 4️⃣ Проверка на вопрос о дате или времени
if (
  intent.intent === "unknown" &&
  /(?:дата|время|число|сегодня|сейчас)/i.test(question)
) {
  const now = new Date()

  // Настрой формат под казахстанское время
  const kztTime = now.toLocaleTimeString("ru-KZ", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const kztDate = now.toLocaleDateString("ru-KZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  responseText = `📅 Сегодня ${kztDate}, сейчас ${kztTime}.`
  await saveChat(sessionId, question, responseText, isNewSession)
  return NextResponse.json({ answer: responseText })
}


// 🛍 5️⃣ Поиск товаров
if (intent.intent === "search_product") {
  const baseQuery =
    intent.normalized_query ||
    intent.original_query ||
    question ||
    ""
  const allKeywords = (intent.filters?.keywords || []).join(" ")

  // Объединяем всё в один поисковый запрос
  const fullQuery = `${baseQuery} ${allKeywords}`.trim().toLowerCase()

  console.log(`🔎 Поисковый запрос: "${fullQuery}"`)
  console.log("🧩 Фильтры:", intent.filters)

  const searchRes = await fetch(`${BASE_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: fullQuery,
      filters: intent.filters || {},
    }),
  })

  const searchResults = await searchRes.json()
  console.log(`✅ Найдено ${searchResults.length} товаров в базе. Запрос: "${fullQuery}"`)

  // 🧠 Обрабатываем результаты
  const validResults = Array.isArray(searchResults)
    ? searchResults.filter((p: any) => {
        const price = Number(p.price)
        return (
          p &&
          p.name &&
          !isNaN(price) &&
          price > 0 &&
          (p.stock === undefined || p.stock >= 0)
        )
      })
    : []

  // 🔍 1️⃣ Фильтруем по релевантности (совпадения с keywords)
  const keywordList = (intent.filters?.keywords || []).map((k: string) =>
    k.toLowerCase()
  )

  const scoredResults = validResults.map((p: any) => {
    const text = `${p.name} ${p.category} ${p.brand}`.toLowerCase()
    let score = 0
    for (const kw of keywordList) {
      if (text.includes(kw)) score++
    }
    return { ...p, _score: score }
  })

  // Оставляем только товары, где совпадает хотя бы 1 ключевое слово
  const relevant = scoredResults
    .filter((p: any) => p._score > 0)
    .sort((a: any, b: any) => b._score - a._score || a.price - b.price)

  // Если ничего не найдено по совпадению — fallback
  const finalResults = relevant.length > 0 ? relevant : validResults

  if (finalResults.length > 0) {
    responseText =
      `📱 Нашёл подходящие варианты по запросу **"${baseQuery}"**:\n\n` +
      finalResults
        .slice(0, 5)
        .map(
          (p: any, i: number) =>
            `${i + 1}. ${p.name}\n💰 ${Number(p.price).toLocaleString()} ₸ | 🔢 SKU: ${
              p.sku ?? "-"
            } | 📦 В наличии: ${p.stock ?? "?"} шт.`
        )
        .join("\n\n") +
      "\n\nХотите, подберу по цвету, объёму памяти или бюджету?"
  } else {
    responseText =
      `😔 Я не нашёл точные совпадения по запросу "${baseQuery}".\n` +
      `Попробуйте уточнить: например, «iPhone 16 Pro 256GB чёрный».`
  }

  // 💾 Сохраняем диалог
  await saveChat(sessionId, question, responseText, isNewSession)
  return NextResponse.json({ answer: responseText })
}




// 💻 6️⃣ Умная сборка ПК (реальные товары из базы с балансировкой бюджета)
if (intent.intent === "build_pc" && (intent.budget || intent.filters?.max_price)) {
  const budget = Number(intent.budget || intent.filters?.max_price || 0)
  const filters = intent.filters || {}
  const keywords = (filters.keywords || []).map((k: string) => k.toLowerCase())
  const brands = (filters.brand || []).map((b: string) => b.toLowerCase())

  responseText = `🧠 Собираю компьютер на бюджет ${budget.toLocaleString()} ₸...\n\n`

  // 💰 Распределение бюджета по компонентам
  const budgetSplit = {
    cpu: 0.18,
    motherboard: 0.15,
    ram: 0.1,
    gpu: 0.35,
    storage: 0.08,
    psu: 0.07,
    case: 0.07,
  }

  const categories = {
    cpu: "процессоры",
    motherboard: "материнские платы",
    ram: "оперативная память",
    gpu: "видеокарты",
    storage: "карты памяти  ",
    psu: "блоки питания",
    case: "корпуса",
  }

  // 🎯 Универсальный поиск компонента из базы
  const searchComponent = async (category: string, allocated: number) => {
    const query = [category, ...keywords, ...brands].join(" ")

    const searchRes = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        filters: {
          category: [category],
          max_price: Math.floor(allocated * 1.2), // небольшой запас
        },
      }),
    })

    const found = await searchRes.json()

    if (!Array.isArray(found) || found.length === 0) return null

    // фильтруем по цене и качеству
    const valid = found.filter(
      (p: any) =>
        p.price &&
        p.price > allocated * 0.6 && // не слишком дешёвые
        p.price < allocated * 1.4 // не слишком дорогие
    )

    if (valid.length === 0) return null

// сортировка по приоритету бренда
const brandPriority = (name: string): number =>
  brands.some((b: string) => name.toLowerCase().includes(b)) ? -1 : 1

valid.sort((a: any, b: any) => brandPriority(a.name) - brandPriority(b.name))


    // выбираем компонент с ценой ближе к среднему
    const sorted = valid.sort((a: any, b: any) => a.price - b.price)
    return sorted[Math.floor(sorted.length / 2)]
  }

  // 🧱 Формируем сборку
  const chosenParts: Record<string, any> = {}
  let total = 0

  for (const [slot, category] of Object.entries(categories)) {
    const allocated = budget * (budgetSplit as any)[slot]
    const item = await searchComponent(category, allocated)
    if (item) {
      chosenParts[slot] = item
      total += Number(item.price)
    }
  }

  // ⚙️ Балансировка — если сильно дешевле бюджета, апгрейдим GPU/CPU
  if (total < budget * 0.85) {
    const gpuBudget = budget * 0.4
    const gpuRes = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "видеокарта",
        filters: { max_price: gpuBudget },
      }),
    })
    const gpuFound = await gpuRes.json()
    if (Array.isArray(gpuFound) && gpuFound.length > 0) {
      const bestGpu = gpuFound.sort((a: any, b: any) => b.price - a.price)[0]
      chosenParts.gpu = bestGpu
      total =
        Object.values(chosenParts)
          .filter((x: any) => x && x.price)
          .reduce((sum: number, x: any) => sum + Number(x.price), 0) || total
    }
  }

  // 💾 Сохраняем сборку
  buildData = chosenParts
  buildData.total = total

  // 🧾 Формируем ответ пользователю
  responseText += Object.entries(chosenParts)
    .filter(([_, x]: any) => x && x.name)
    .map(
      ([slot, item]: any) =>
        `— **${slot.toUpperCase()}**: ${item.name}\n💰 ${Number(item.price).toLocaleString()} ₸`
    )
    .join("\n\n")

  responseText += `\n\n💵 **Общая сумма:** ${total.toLocaleString()} ₸`

  if (total > budget * 1.1)
    responseText += `\n⚠️ Сборка немного превышает бюджет (${(total - budget).toLocaleString()} ₸).`
  else if (total < budget * 0.8)
    responseText += `\n💡 Есть запас бюджета — можно улучшить видеокарту или процессор.`
  else responseText += `\n✅ Отлично! Сборка укладывается в бюджет.`

  responseText += `\n\nВсе цены взяты из базы Over-Shop.kz 💾`

  // 💾 Сохраняем в БД
  await prisma.sessionBuild.update({
    where: { sessionId },
    data: { data: buildData },
  })
}

// 🛒 7️⃣ Заказ последней сборки
if (intent.intent === "order_build") {
  const lastBuild = await prisma.sessionBuild.findUnique({ where: { sessionId } })

  if (lastBuild && Object.keys(lastBuild.data || {}).length > 0) {
    const buildInfo = lastBuild.data as any
    const total = buildInfo.total || 0

    responseText = `🧾 Вы хотите оформить заказ на последнюю сборку ПК стоимостью ${total.toLocaleString()} ₸?\n\n`

    responseText += Object.entries(buildInfo)
      .filter(([key, val]: [string, any]) => val && val.name)
      .map(([slot, item]: [string, any]) => `— **${slot.toUpperCase()}**: ${item.name}`)
      .join("\n")

    responseText += `\n\n✅ Подтвердите заказ или уточните детали — например, цвет корпуса, доставку или оплату.`
  } else {
    responseText = "❌ У вас пока нет сохранённой сборки. Сначала соберите ПК, а потом я помогу оформить заказ 💻"
  }

  await saveChat(sessionId, question, responseText, isNewSession)
  return NextResponse.json({ answer: responseText })
}




// 🧠 9️⃣ GPT улучшает только подачу, но не контент
let finalAnswer = responseText

// Проверяем, есть ли реальные товары (если есть ₸ и хотя бы один компонент)
const hasRealData =
  responseText.includes("₸") &&
  (responseText.includes("CPU") ||
    responseText.includes("GPU") ||
    responseText.includes("SSD") ||
    responseText.includes("RAM") ||
    responseText.includes("видеокарта") ||
    responseText.includes("процессор"))


    // 🧠 Добавляем в контекст GPT данные последней сборки, если есть
let lastBuild = await prisma.sessionBuild.findUnique({ where: { sessionId } })
let buildContext = ""

if (lastBuild && Object.keys(lastBuild.data || {}).length > 0) {
  const buildInfo = lastBuild.data as any
  const total = buildInfo.total?.toLocaleString() || "неизвестно"
  buildContext = `
  У пользователя уже есть сохранённая сборка ПК стоимостью ${total} ₸.
  Компоненты:
  ${Object.entries(buildInfo)
    .filter(([key, val]: [string, any]) => val && val.name)
    .map(([slot, item]: [string, any]) => `- ${slot}: ${item.name} (${item.price} ₸)`)
    .join("\n")}
  Если он спрашивает "мы собрали пк?", "покажи сборку" или что-то подобное — используй эти данные, не пересобирай заново.
  `
}


if (hasRealData) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ты — Роберт, консультант Over-Shop.kz.
Тебе передан готовый ответ с реальными товарами и ценами из базы dealer.json.
❗ Твоя задача:
1. Переформулировать текст, сделать его дружелюбнее.
2. Не добавлять, не удалять, не менять товары, цены, бренды, SKU, категории.
3. Не выдумывать ничего нового — список уже готов и взят из базы.
4. Просто перепиши ответ в более разговорной форме, сохранив всё содержимое.
Если данные уже отформатированы — просто верни их как есть.

Пример:
❌ Было:
1. Intel i5 - 50 000
2. Asus RTX 4060 - 300 000
✅ Стало:
1. Intel i5 — 50 000 ₸
2. Видеокарта Asus RTX 4060 — 300 000 ₸
Ты общаешься с пользователем и помнишь контекст последних сообщений.
${buildContext}

`,
      },
      ...conversationHistory.slice(-8),
      { role: "assistant", content: responseText }, // 👈 теперь GPT получает твой результат
      { role: "user", content: "Сделай текст чуть более естественным, но не изменяй данные." },
    ],
    temperature: 0.3,
    max_tokens: 400,
  })

  finalAnswer = completion.choices[0].message.content || responseText


} else {
  // 💬 Если товаров нет — GPT может сформулировать дружелюбный ответ
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ты — Роберт, консультант Over-Shop.kz.
Если товаров или сборки нет — вежливо объясни это пользователю и предложи уточнить запрос.
Не придумывай несуществующие товары.


Адреса:
- Алматы: пр. Абылай хана, 7
- Астана: пр. Республики, 72
- Павлодар: ул. Желтоксан, 7

Контакты:
- Интернет-магазин: +7 771 013-00-20
- Kaspi: +7 775 894-93-84
- Email: sales@overclockers.kz
`,
      },
      ...conversationHistory,
      { role: "user", content: question },
    ],
    temperature: 0.6,
    max_tokens: 400,
  })

  finalAnswer = completion.choices[0].message.content || "Не удалось найти товары 😔"
}

// 💾 Сохраняем сообщение в БД
await saveChat(sessionId, question, finalAnswer, isNewSession)

// 🔙 Возвращаем ответ пользователю
return NextResponse.json({ answer: finalAnswer })

// ✅ Закрываем try
} catch (error) {
  console.error("❌ Ошибка chat API:", error)
  return NextResponse.json({ error: "Ошибка при обработке запроса" }, { status: 500 })
}
}

// 💾 Вспомогательная функция сохранения сообщений
async function saveChat(sessionId: string, userText: string, botText: string, isNew: boolean) {
  await prisma.message.createMany({
    data: [
      { sessionId, role: "user", content: userText },
      { sessionId, role: "assistant", content: botText },
    ],
  })
}
  