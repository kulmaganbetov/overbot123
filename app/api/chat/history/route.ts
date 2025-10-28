import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { cookies } from "next/headers"

export async function GET() {
  // 👇 cookies() теперь асинхронная
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("sessionId")?.value

  if (!sessionId) {
    return NextResponse.json({ messages: [] })
  }

  // Загружаем историю сообщений пользователя
  const history = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  })

  // Объединяем user + assistant сообщения в пары
  const messages: { user: string; bot: string }[] = []
  for (let i = 0; i < history.length; i += 2) {
    messages.push({
      user: history[i]?.content || "",
      bot: history[i + 1]?.content || "",
    })
  }

  return NextResponse.json({ messages })
}
