"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import logo from "@/../public/logo2.svg"
import { Orbitron } from "next/font/google"

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500"],
})

export default function Home() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<
    { user: string; bot: string; time: string }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [typingDots, setTypingDots] = useState(".")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // анимация "печатает..."
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setTypingDots((prev) => (prev.length < 3 ? prev + "." : "."))
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  // прокрутка вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage() {
    if (!input.trim()) return
    const question = input
    const time = new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })

    setMessages([...messages, { user: question, bot: "", time }])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })

      if (!res.ok) throw new Error(`Ошибка запроса: ${res.status}`)
      const text = await res.text()
      if (!text) throw new Error("Пустой ответ от сервера")

      const data = JSON.parse(text)

      const botTime = new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })

      setMessages((prev) =>
        prev.map((msg, i) =>
          i === prev.length - 1
            ? { ...msg, bot: data.answer, time: `${msg.time} / ${botTime}` }
            : msg
        )
      )
    } catch (err) {
      console.error("Ошибка:", err)
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === prev.length - 1
            ? {
                ...msg,
                bot: "⚠️ Ошибка при получении ответа от Роберта.",
                time: `${msg.time}`,
              }
            : msg
        )
      )
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-orange-50 via-orange-100 to-white p-4">
      <div className="w-full max-w-lg bg-white shadow-2xl rounded-2xl p-6 flex flex-col h-[85vh] border border-orange-200">
{/* HEADER */}
<div className="flex flex-col items-center mb-5 border-b border-orange-200 pb-4">
  <div className="relative">
    <div className="absolute inset-0 blur-lg bg-orange-400/40 rounded-full scale-125"></div>
    <Image
      src={logo}
      alt="Over-Shop.kz Logo"
      width={150}
      height={150}
      className="relative drop-shadow-md"
      priority
    />
  </div>
<h1
  className={`${orbitron.className} text-3xl md:text-xl font-extrabold text-orange-600 mt-2 text-center leading-tight tracking-wide`}
>
  🤖 Роберт — электронный помощник<br />
  <span className="text-gray-700 text-lg md:text-l tracking-tight">
    Over-Shop.kz
  </span>
</h1>

</div>


        {/* CHAT */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-4 scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-orange-100">
          {messages.map((m, i) => (
            <div key={i}>
              {/* user */}
              <div className="flex justify-end">
                <div className="bg-orange-500 text-white p-3 rounded-2xl rounded-br-none max-w-[80%] break-words">
                  <p className="whitespace-pre-line">{m.user}</p>
                  <p className="text-xs opacity-70 text-right mt-1">
                    {m.time.split("/")[0]}
                  </p>
                </div>
              </div>

              {/* bot */}
              {m.bot && (
                <div className="flex justify-start mt-2">
                  <div className="bg-gray-100 text-gray-800 p-3 rounded-2xl rounded-bl-none max-w-[80%] break-words">
                    <p className="whitespace-pre-line">{m.bot}</p>
                    <p className="text-xs opacity-70 text-left mt-1">
                      {m.time.split("/")[1] || ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* typing indicator */}
          {loading && (
            <div className="flex justify-start mt-2">
              <div className="bg-gray-100 text-gray-800 p-3 rounded-2xl rounded-bl-none max-w-[70%] italic text-sm">
                Роберт печатает{typingDots}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="flex gap-3 mt-auto">
          <input
  className="flex-1 border border-orange-300 rounded-full px-4 py-2 focus:ring-2 focus:ring-orange-400 outline-none text-gray-800 placeholder-gray-400 bg-white"
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={handleKeyPress}
  placeholder="Напиши сообщение Роберту... 😊"
/>

          <button
            onClick={sendMessage}
            disabled={loading}
            className={`flex items-center justify-center bg-orange-500 text-white px-5 py-2 rounded-full transition-all hover:bg-orange-600 ${
              loading ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {loading ? (
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.2s]"></span>
                <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.1s]"></span>
                <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
              </div>
            ) : (
              "➤"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
