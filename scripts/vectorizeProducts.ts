import "dotenv/config"
import fs from "fs"
import path from "path"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const BATCH_SIZE = 100       // Сколько товаров обрабатываем за один запрос
const PARALLEL_LIMIT = 5     // Сколько батчей отправляем одновременно

async function createEmbeddingsBatch(items: any[]) {
  const inputs = items.map(
    (p) => `${p.name || ""} ${p.brand || ""} ${p.category || ""}`.trim()
  )

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: inputs,
  })

  return response.data.map((d, i) => ({
    ...items[i],
    embedding: d.embedding,
  }))
}

async function processBatches(products: any[], existing: Record<string, any>) {
  const outPath = path.join(process.cwd(), "public", "dealer_vectors.json")
  const total = products.length
  const batches = []

  for (let i = 0; i < total; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE))
  }

  const results: any[] = []
  let completed = 0
  console.log(`📦 Начинаем векторизацию ${total} товаров...`)

  async function runBatch(batch: any[]) {
    try {
      const vectors = await createEmbeddingsBatch(batch)
      results.push(...vectors)
      completed += batch.length
      console.log(`✅ ${completed}/${total} товаров готово`)
    } catch (err) {
      console.error("❌ Ошибка в батче:", err)
    }
  }

  // ограничиваем количество параллельных потоков
  const queue = [...batches]
  const workers = Array.from({ length: PARALLEL_LIMIT }, async () => {
    while (queue.length > 0) {
      const batch = queue.shift()
      if (batch) await runBatch(batch)
    }
  })

  await Promise.all(workers)

  // 🔄 Объединяем новые и старые данные
  const merged: Record<string, any> = { ...existing }
  for (const p of results) {
    merged[p.sku] = p
  }

  const outputArray = Object.values(merged)
  fs.writeFileSync(outPath, JSON.stringify(outputArray, null, 2), "utf8")

  console.log(`🚀 Векторизация завершена. Обновлено ${results.length} товаров. Всего: ${outputArray.length}`)
}

async function main() {
  const dealerPath = path.join(process.cwd(), "public", "dealer.json")
  const vectorPath = path.join(process.cwd(), "public", "dealer_vectors.json")

  if (!fs.existsSync(dealerPath)) {
    console.error("❌ dealer.json не найден.")
    process.exit(1)
  }

  const dealerData = JSON.parse(fs.readFileSync(dealerPath, "utf8"))
  const existing: Record<string, any> = {}

  if (fs.existsSync(vectorPath)) {
    const oldData = JSON.parse(fs.readFileSync(vectorPath, "utf8"))
    for (const p of oldData) {
      if (p.sku) existing[p.sku] = p
    }
    console.log(`📂 Найдено ${oldData.length} векторизованных товаров`)
  }

  // ⚙️ Определяем новые или изменённые товары
  const newProducts = dealerData.filter((p: any) => {
    const existingItem = existing[p.sku]
    // если нет или изменилось название, бренд или категория
    if (!existingItem) return true
    if (
      existingItem.name !== p.name ||
      existingItem.brand !== p.brand ||
      existingItem.category !== p.category
    )
      return true
    return false
  })

  if (newProducts.length === 0) {
    console.log("✅ Все товары уже векторизованы. Нечего обновлять.")
    return
  }

  console.log(`🧠 Новых или изменённых товаров: ${newProducts.length}`)
  await processBatches(newProducts, existing)
}

main().catch(console.error)
