import { Client } from "basic-ftp"
import "dotenv/config"
import fs from "fs"
import path from "path"
import Papa, { ParseResult } from "papaparse"
import iconv from "iconv-lite"

const FTP_CONFIG = {
  host: process.env.FTP_HOST || "over-shop.kz",
  user: process.env.FTP_USER || "zoomos1",
  password: process.env.FTP_PASSWORD || "FJsV6cFv",
  port: Number(process.env.FTP_PORT || 21),
}

const REMOTE_PATH = "/_FTP/zoomos1/Dealer.csv"
const LOCAL_CSV_PATH = path.join(process.cwd(), "public", "Dealer.csv")
const LOCAL_JSON_PATH = path.join(process.cwd(), "public", "dealer.json")

export async function updateDealerFile() {
  const client = new Client()
  ;(client.ftp as any).verbose = true

  try {
    console.log("📡 Подключаемся к FTP...")

    // ⚙️ Настройка соединения
    ;(client.ftp as any).useEPSV = false
    ;(client.ftp as any).socketTimeout = 20000

    await client.access({
      host: FTP_CONFIG.host,
      user: FTP_CONFIG.user,
      password: FTP_CONFIG.password,
      port: FTP_CONFIG.port,
      secure: false,
    } as any)

    console.log("⬇️ Скачиваем Dealer.csv...")

    try {
      await client.downloadTo(LOCAL_CSV_PATH, REMOTE_PATH)
      console.log("✅ Dealer.csv успешно скачан:", new Date().toLocaleString())
    } catch (ftpErr) {
      console.warn("⚠️ FTP не сработал, пробуем HTTPS-загрузку...")
      await downloadViaHTTPS()
    }

    // 🔤 Декодируем CSV
    const buffer = fs.readFileSync(LOCAL_CSV_PATH)
    const text = iconv.decode(buffer, "win1251")
    console.log("🔤 Используем кодировку CP1251 (Windows-1251)")

    // 📊 Парсим CSV
    let parsed: ParseResult<Record<string, string>> = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
    })

    if (!parsed.data.length || !parsed.data[0]?.["Номенклатура"]) {
      parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: ",",
      })
      console.log("⚙️ Переключено на запятую (,) как разделитель")
    }

    console.log("📊 Прочитано строк:", parsed.data.length)
    console.log("🧾 Заголовки:", Object.keys(parsed.data[0] || {}))

    // 🧮 Преобразуем в JSON
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
    console.log(`💾 Обновлено ${products.length} товаров в dealer.json ✅`)
  } catch (err: any) {
    if (err.code === "ECONNRESET") {
      console.log("⚠️ Соединение сброшено сервером, пробуем снова через 3 секунды...")
      await new Promise((r) => setTimeout(r, 3000))
      return updateDealerFile()
    }
    console.error("❌ Ошибка при обновлении Dealer.csv:", err)
  } finally {
    client.close()
  }
}

// 🌐 Альтернатива — загрузка через HTTPS
async function downloadViaHTTPS() {
  try {
    const httpsUrl = "https://over-shop.kz/_FTP/zoomos1/Dealer.csv"
    console.log("🌐 Пробуем скачать через HTTPS:", httpsUrl)
    const res = await fetch(httpsUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.arrayBuffer()
    fs.writeFileSync(LOCAL_CSV_PATH, Buffer.from(data))
    console.log("✅ Dealer.csv скачан через HTTPS")
  } catch (httpErr) {
    console.error("❌ Ошибка при HTTPS-загрузке:", httpErr)
  }
}

// 🚀 Автозапуск
if (require.main === module) {
  updateDealerFile().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
