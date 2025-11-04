import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

// 🔹 Очистка текста
function clean(text: string): string {
  return text
    ?.toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9а-яё\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 🔹 Мягкое сравнение (расстояние Левенштейна)
function levenshtein(a: string, b: string): number {
  const matrix = []
  const alen = a.length
  const blen = b.length

  if (!alen) return blen
  if (!blen) return alen

  for (let i = 0; i <= blen; i++) matrix[i] = [i]
  for (let j = 0; j <= alen; j++) matrix[0][j] = j

  for (let i = 1; i <= blen; i++) {
    for (let j = 1; j <= alen; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[blen][alen]
}

// 🔹 Проверяем близость слов
function isSimilar(a: string, b: string, threshold = 0.25): boolean {
  const distance = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return maxLen > 0 && distance / maxLen < threshold
}

export async function POST(req: Request) {
  try {
    const { query, filters } = await req.json()
    const filePath = path.join(process.cwd(), "public", "dealer.json")
    const jsonData = fs.readFileSync(filePath, "utf-8")
    const products = JSON.parse(jsonData)

    const q = clean(query)
    const allKeywords = [
      q,
      ...(filters?.keywords || []).map(clean),
      ...(filters?.brand || []).map(clean),
      ...(filters?.category || []).map(clean),
    ].filter(Boolean)

    if (!allKeywords.length) {
      return NextResponse.json([], { status: 200 })
    }

    const results = products.filter((p: any) => {
      const name = clean(p.name || "")
      const brand = clean(p.brand || "")
      const category = clean(p.category || "")
      const article = clean(p.article || "")
      const sku = clean(p.sku || "")

      const price = Number(p.credit || p.price || 0)

      // 🔍 Проверяем совпадения хотя бы по одному ключу
      const matchesKeyword = allKeywords.some((kw: string) => {
        return (
          name.includes(kw) ||
          brand.includes(kw) ||
          category.includes(kw) ||
          article.includes(kw) ||
          sku.includes(kw) ||
          isSimilar(name, kw) ||
          isSimilar(category, kw)
        )
      })

      // 🧩 Проверяем фильтры
      const matchesFilters =
        (!filters?.brand?.length ||
          filters.brand.some((b: string) => brand.includes(clean(b)) || isSimilar(brand, clean(b)))) &&
        (!filters?.category?.length ||
          filters.category.some(
            (c: string) => category.includes(clean(c)) || isSimilar(category, clean(c))
          )) &&
        (!filters?.max_price || price <= Number(filters.max_price)) &&
        (!filters?.min_price || price >= Number(filters.min_price || 0))

      return matchesKeyword && matchesFilters
    })

    // 📈 Ранжируем по похожести
    const ranked = results
      .map((p: any) => {
        const name = clean(p.name)
        const score = allKeywords.reduce((acc: number, kw: string) => {
          if (name.includes(kw)) acc += 3
          if (isSimilar(name, kw)) acc += 2
          return acc
        }, 0)
        return { ...p, score }
      })
      .sort((a: any, b: any) => b.score - a.score)

    const topResults = ranked.slice(0, 10).map((p: any) => ({
      sku: p.sku,
      name: p.name,
      price: p.credit || p.price,
      stock: p.stock,
      brand: p.brand,
    }))

    console.log(`🔍 Найдено ${topResults.length} товаров. Запрос: "${query}"`)
    return NextResponse.json(topResults)
  } catch (error) {
    console.error("Ошибка в search API:", error)
    return NextResponse.json([], { status: 500 })
  }
}
