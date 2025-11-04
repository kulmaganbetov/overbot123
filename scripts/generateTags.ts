// scripts/generateTags.ts
import "dotenv/config"
import fs from "fs"
import path from "path"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY })
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY не задан. Убедитесь, что в .env.local есть OPENAI_API_KEY")
}

const DEALER_PATH = path.join(process.cwd(), "public", "dealer.json")
const OUT_PATH = path.join(process.cwd(), "public", "dealer_with_tags.json")

const BATCH_SIZE = 20 // менять по необходимости
const DELAY_BETWEEN_BATCHES_MS = 1200 // пауза между батчами (уменьшай/увеличивай)
const SAVE_EVERY_N_BATCHES = 1 // как часто делать автосохранение (батчей)

type Product = {
  sku?: string
  name?: string
  brand?: string
  category?: string
  credit?: string
  stock?: number
  tags?: string[]
  // другие поля возможны
}

function ts() {
  return new Date().toISOString().replace("T", " ").replace("Z", "")
}

function human(n: number) {
  return n.toLocaleString("ru-RU")
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function estimateETA(startTime: number, done: number, total: number) {
  const elapsed = (Date.now() - startTime) / 1000 // seconds
  const perItem = elapsed / Math.max(1, done)
  const remaining = Math.max(0, total - done)
  const etaSec = perItem * remaining
  const mins = Math.floor(etaSec / 60)
  const secs = Math.round(etaSec % 60)
  return `${mins}m ${secs}s`
}

async function generateTags() {
  console.log(`${ts()} 📦 Загружаем dealer.json...`)
  if (!fs.existsSync(DEALER_PATH)) {
    console.error(`${ts()} ❌ Файл dealer.json не найден в public/. Сначала запустите updateDealer.ts`)
    process.exit(1)
  }

  const raw = fs.readFileSync(DEALER_PATH, "utf8")
  let products: Product[] = []
  try {
    products = JSON.parse(raw)
  } catch (e) {
    console.error(`${ts()} ❌ Ошибка парсинга dealer.json:`, e)
    process.exit(1)
  }

  const total = products.length
  console.log(`${ts()} ℹ️ Всего товаров: ${human(total)}`)

  // Загружаем уже существующие теги (resume)
  const existingMap: Record<string, Product> = {}
  if (fs.existsSync(OUT_PATH)) {
    try {
      const rawOut = fs.readFileSync(OUT_PATH, "utf8")
      const prev: Product[] = rawOut.trim().length ? JSON.parse(rawOut) : []
      for (const p of prev) {
        if (p.sku) existingMap[p.sku] = p
      }
      console.log(`${ts()} ↪️ Найдено ${human(Object.keys(existingMap).length)} ранее обработанных товаров — будут пропущены`)
    } catch (e) {
      console.warn(`${ts()} ⚠️ Не удалось прочитать существующий dealer_with_tags.json — начну с нуля.`, e)
    }
  }

  // Фильтруем список на обработку
  const toProcess = products.filter((p) => {
    if (!p.sku) return true // без sku — обработаем (на всякий случай)
    return !existingMap[p.sku]
  })

  if (toProcess.length === 0) {
    console.log(`${ts()} ✅ Все товары уже имеют теги — выход.`)
    return
  }

  console.log(`${ts()} 🔎 Нужно сгенерировать теги для: ${human(toProcess.length)} товаров`)

  // Подготовка батчей
  const batches: Product[][] = []
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    batches.push(toProcess.slice(i, i + BATCH_SIZE))
  }

  const output: Product[] = Object.values(existingMap) // начальный массив (resume)
  let processed = 0
  let successCount = 0
  let failCount = 0
  const startTime = Date.now()
  const errors: { idx: number; sku?: string; err: any }[] = []

  console.log(`${ts()} 🚀 Старт генерации тегов — батчей: ${batches.length}, размер батча: ${BATCH_SIZE}`)

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const batchStartIdx = bi * BATCH_SIZE
    const displayedFrom = batchStartIdx + 1
    const displayedTo = batchStartIdx + batch.length

    console.log(`${ts()} 🧩 Батч ${bi + 1}/${batches.length} — товары ${displayedFrom}–${displayedTo}`)

    // Формируем единый промпт для батча
    const itemsText = batch
      .map((p, idx) => `${idx + 1}. ${p.name || "(без имени)"} | Категория: ${p.category || "-"} | Бренд: ${p.brand || "-"}`)
      .join("\n")

    const prompt = `
Ты — ассистент, который создаёт 8–12 коротких тегов (ключевых слов) для каждого товара.
Теги нужны для поиска в магазине. Для каждого товара верни массив тегов в одной строке.
Теги короткие, по возможности include: русские, английские, казахские варианты, модели, бренд, базовые синонимы и сокращения.
Формат ответа: JSON-массив массивов, например:
[["iphone","айфон","apple","смартфон","15","pro","макс"], ["asus","ноутбук","laptop","vivobook"]]

Товары:
${itemsText}
    `.trim()

    // Retry logic with exponential backoff
    const MAX_RETRIES = 5
    let attempt = 0
    let success = false
    let responseText = ""

    while (attempt < MAX_RETRIES && !success) {
      try {
        attempt++
        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          // timeout not supported here reliably; бэкофф ниже
        })

        responseText = res.choices[0]?.message?.content?.trim() ?? ""
        if (!responseText) throw new Error("Empty response from model")
        success = true
      } catch (err: any) {
        const code = err?.code || err?.status || err?.message
        console.warn(`${ts()} ⚠️ Ошибка API (попытка ${attempt}):`, code)
        if (attempt < MAX_RETRIES) {
          const wait = 1000 * Math.pow(2, attempt) // экспоненциальный бэкофф
          console.log(`${ts()} ⏳ Ждём ${Math.round(wait / 1000)}s перед новой попыткой...`)
          await sleep(wait)
          continue
        } else {
          console.error(`${ts()} ❌ Не удалось обработать батч ${bi + 1} после ${MAX_RETRIES} попыток`)
          errors.push({ idx: bi, sku: batch[0]?.sku, err: err?.toString?.() ?? err })
          break
        }
      }
    }

    // Парсим ответ и привязываем теги к товарам
    if (success) {
      let parsedTags: string[][] = []
      try {
        // Попробуем чисто распарсить JSON из ответа
        // Иногда модель возвращает текст с оговорками — попытаемся выделить JSON
        let jsonText = responseText

        // Если ответ содержит кодовый блок ```json ... ``` — извлечём его
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1]
        }

        // Иногда модель возвращает строку с одиночными кавычками — заменим аккуратно
        try {
          parsedTags = JSON.parse(jsonText)
        } catch {
          // Попробуем привести одиночные кавычки к двойным (не идеал, но часто помогает)
          const fixed = jsonText.replace(/'/g, '"')
          parsedTags = JSON.parse(fixed)
        }

        // Если parsedTags не массив нужной длины — fallback: разделение по строкам
        if (!Array.isArray(parsedTags) || parsedTags.length !== batch.length) {
          // Попробуем простейший разбор: по строкам разделённым переводом строки
          const lines = responseText.split(/\r?\n/).filter(Boolean)
          const arr: string[][] = []
          for (const ln of lines) {
            const maybe = ln.replace(/^[0-9\.\)\s-]+/, "").trim()
            const parts = maybe.split(",").map((t) => t.trim()).filter(Boolean)
            if (parts.length) arr.push(parts)
          }
          if (arr.length === batch.length) parsedTags = arr
          else {
            // если всё плохо — сгенерируем минимальные теги из названий (fallback)
            parsedTags = batch.map((p) => {
              const words = (p.name || "").toLowerCase().split(/\s+/).slice(0, 5)
              return Array.from(new Set(words)).filter(Boolean)
            })
            console.warn(`${ts()} ⚠️ Fallback: использованы простые теги из названий (батч ${bi + 1})`)
          }
        }
      } catch (e) {
        console.warn(`${ts()} ⚠️ Ошибка парсинга ответа модели — используем fallback теги`, e)
        parsedTags = batch.map((p) => {
          const words = (p.name || "").toLowerCase().split(/\s+/).slice(0, 5)
          return Array.from(new Set(words)).filter(Boolean)
        })
        errors.push({ idx: bi, sku: batch[0]?.sku, err: "parse_error" })
      }

      // Присваиваем теги и добавляем в output
      for (let i = 0; i < batch.length; i++) {
        const prod = batch[i]
        const tags = Array.isArray(parsedTags[i]) ? parsedTags[i].map((t) => String(t).trim()).filter(Boolean) : []
        prod.tags = tags
        output.push(prod)
        successCount++
      }
    } else {
      // Не удалось получить ответ — добавляем пустые теги и помечаем ошибку
      for (const prod of batch) {
        prod.tags = prod.tags || []
        output.push(prod)
        failCount++
      }
    }

    processed += batch.length

    // Автосохранение
    if ((bi + 1) % SAVE_EVERY_N_BATCHES === 0 || bi === batches.length - 1) {
      fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8")
      console.log(`${ts()} 💾 Промежуточное сохранение: ${human(output.length)} записей (после батча ${bi + 1})`)
    }

    // Статистика и ETA
    const percent = Math.round((processed / toProcess.length) * 100)
    const eta = estimateETA(startTime, processed, toProcess.length)
    const avgPerSec = ((Date.now() - startTime) / 1000) / Math.max(1, processed)
    console.log(`${ts()} ✅ Обработано: ${human(processed)}/${human(toProcess.length)} (${percent}%) — ETA: ${eta} — avg: ${avgPerSec.toFixed(2)}s/item`)

    // Пауза между батчами
    await sleep(DELAY_BETWEEN_BATCHES_MS)
  }

  // Финальная запись
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8")
  console.log(`${ts()} 🎉 Генерация завершена. Всего: ${human(output.length)} товаров. Успешно: ${successCount}, неуспешно(fallback): ${failCount}`)

  if (errors.length) {
    console.warn(`${ts()} ⚠️ Были ошибки в ${errors.length} батчах. Примеры:`, errors.slice(0, 5))
  }

  console.log(`${ts()} 🔚 Файл сохранён: ${OUT_PATH}`)
}

generateTags().catch((e) => {
  console.error(`${ts()} ❌ Скрипт упал с ошибкой:`, e)
  process.exit(1)
})
