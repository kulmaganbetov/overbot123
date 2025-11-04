import { prisma } from "./db"

/**
 * Поиск товаров по векторному сходству
 * @param queryVector - Вектор запроса (массив чисел)
 * @param limit - Максимальное количество результатов (по умолчанию 10)
 * @returns Массив товаров с полями id, sku, name и similarity (косинусное сходство)
 */
export async function searchProductsByVector(
  queryVector: number[],
  limit: number = 10
) {
  try {
    // Преобразуем массив чисел в формат PostgreSQL для pgvector
    // pgvector принимает формат '[1.0,2.0,3.0]' как строковый литерал
    // Используем двойные кавычки для экранирования внутри SQL строки
    const vectorArrayString = queryVector.join(",")
    // Формат: '[1,2,3]'::vector - строковый литерал с квадратными скобками, приведенный к типу vector
    const vectorLiteral = `'[${vectorArrayString}]'`
    
    // В PostgreSQL с расширением pgvector оператор <=> возвращает косинусное расстояние
    // 1 - (embedding <=> query_vector) даст нам косинусное сходство
    // Примечание: используем $queryRawUnsafe с правильно отформатированным вектором
    const query = `
      SELECT 
        id,
        sku,
        name,
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "Product"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `
    
    const products = await prisma.$queryRawUnsafe<Array<{
      id: number
      sku: string
      name: string
      similarity: number
    }>>(query)

    return products
  } catch (error) {
    console.error("Ошибка векторного поиска:", error)
    throw error
  }
}

