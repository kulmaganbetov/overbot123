// scripts/updateDealer.ts
import { Client } from "basic-ftp"
import "dotenv/config"
import fs from "fs"
import path from "path"
import Papa, { ParseResult } from "papaparse"
import iconv from "iconv-lite"
import { openai } from "@/lib/openai"

const FTP_CONFIG = {
  host: process.env.FTP_HOST || "over-shop.kz",
  user: process.env.FTP_USER || "zoomos1",
  password: process.env.FTP_PASSWORD || "FJsV6cFv",
  port: Number(process.env.FTP_PORT || 21),
}

const REMOTE_PATH = "/Dealer.csv"
const LOCAL_CSV_PATH = path.join(process.cwd(), "public", "Dealer.csv")
const LOCAL_JSON_PATH = path.join(process.cwd(), "public", "dealer.json")
const LOCAL_VECTORS_PATH = path.join(process.cwd(), "public", "dealer_vectors.json")

export async function updateDealerFile() {
  const client = new Client()
  client.ftp.verbose = true

  try {
    console.log("📡 Подключаемся к FTP...")
    await client.access({ ...FTP_CONFIG, secure: false })
    client.ftp.socket?.setTimeout(15000)

    console.log("⬇️ Скачиваем Dealer.csv...")
    await client.downloadTo(LOCAL_CSV_PATH, REMOTE_PATH)
    console.log("✅ Dealer.csv скачан:", new Date().toLocaleString())

    // читаем CSV
    const buffer = fs.readFileSync(LOCAL_CSV_PATH)
    const text = iconv.decode(buffer, "win1251")
    console.log("🔤 Используем кодировку CP1251 (Windows-1251)")

    // парсим CSV
    let parsed: ParseResult<Record<string, string>> = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
    })

    if (
      parsed.data.length === 0 ||
      !parsed.data[0] ||
      !("Номенклатура" in parsed.data[0])
    ) {
      parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: ",",
      })
      console.log("⚙️ Переключено на запятую (,) как разделитель")
    }

    console.log("📊 Прочитано строк:", parsed.data.length)
    console.log("🧾 Заголовки:", Object.keys(parsed.data[0] || {}))

    const products = parsed.data
      .filter((p) => p["Номенклатура"])
      .map((p) => ({
        sku: (p["SKU"] || "").trim(),
        kaspiCode: (p["КодКаспи"] || "").trim(),
        name: (p["Номенклатура"] || "").trim(),
        supplier: (p["Поставщик"] || "").trim(),
        stock: Number((p["Остаток"] || "0").replace(/\s+/g, "")) || 0,
        price: Number((p["Цена"] || "0").replace(/\s+/g, "")) || 0,
        retail: Number((p["РРЦ"] || "0").replace(/\s+/g, "")) || 0,
        article: (p["Артикул"] || "").trim(),
        brand: (p["Производитель"] || "").trim(),
        credit: (p["КредитРассрочка"] || "").trim(),
        bonus: (p["БонуснаяЦена"] || "").trim(),
        special: (p["СпецЦена"] || "").trim(),
        warranty: (p["СрокГарантии"] || "").trim(),
        category: (p["Категория"] || "").trim(),
        supplierCode: (p["КодПоставщика"] || "").trim(),
      }))

    fs.writeFileSync(LOCAL_JSON_PATH, JSON.stringify(products, null, 2), "utf8")
    console.log(`💾 Обновлено ${products.length} товаров в dealer.json`)

    // 🧠 Создание векторного индекса
    await createVectorIndex(products)
  } catch (err) {
    console.error("❌ Ошибка при обновлении Dealer.csv:", err)
  } finally {
    client.close()
  }
}

async function createVectorIndex(products: any[]) {
  console.log("🧠 Создание векторного индекса (батчами) + keywords...")
  const LOCAL_VECTORS_PATH = path.join(process.cwd(), "public", "dealer_vectors.json")
  const batchSize = 400
  const total = Math.min(products.length, 10000)
  const allVectors: { sku: string; vector: number[]; keywords?: string }[] = []

  for (let i = 0; i < total; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const texts = batch.map((p) => {
      // keywords: объединяем поля для лучшего match
      const kw = [p.name, p.brand, p.category, p.article, p.sku, p.kaspiCode].filter(Boolean).join(" ")
      return `${kw}`
    })

    console.log(`➡️ Обрабатываем ${i + 1}–${i + batch.length} / ${total}`)
    const embeddings = await openai.embeddings.create({ model: "text-embedding-3-small", input: texts })
    const vectors = embeddings.data.map((e: any, idx: number) => ({
      sku: batch[idx].sku,
      vector: e.embedding,
      keywords: texts[idx],
    }))
    allVectors.push(...vectors)
  }

  fs.writeFileSync(LOCAL_VECTORS_PATH, JSON.stringify(allVectors, null, 2), "utf8")
  console.log(`✅ Векторный индекс сохранен (${allVectors.length} записей)`)
}



if (require.main === module) {
  updateDealerFile().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
