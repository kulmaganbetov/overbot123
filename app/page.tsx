"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import logo from "@/../public/logo2.svg"
import { Orbitron } from "next/font/google"
import { Rubik } from "next/font/google"


const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500"],
})

const rubik = Rubik({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
})

// 👇 Компонент анимированного текста
function TypingIntro({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("")

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1))
      i++
      if (i === text.length) clearInterval(interval)
    }, 50) // скорость печати
    return () => clearInterval(interval)
  }, [text])

  return (
    <div className="text-center text-gray-600 text-lg font-normal tracking-wide">
      {displayed}
      <span className="animate-pulse">▌</span>
    </div>
  )
}

export default function Home() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<
    { user: string; bot: string; time: string; file?: string }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [typingDots, setTypingDots] = useState(".")
  const [file, setFile] = useState<File | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // typing animation
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setTypingDots((prev) => (prev.length < 3 ? prev + "." : "."))
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  // scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // auto height for textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [input])

  async function sendMessage() {
    if (!input.trim() && !file) return
    const question = input
    const time = new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })

    const newMsg = { user: question, bot: "", time, file: file ? file.name : undefined }
    setMessages([...messages, newMsg])
    setInput("")
    setFile(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append("question", question)
      if (file) formData.append("file", file)

      const res = await fetch("/api/chat", { method: "POST", body: formData })
      if (!res.ok) throw new Error(`Ошибка запроса: ${res.status}`)
      const data = await res.json()

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
            ? { ...msg, bot: "⚠️ Ошибка при получении ответа от Роберта." }
            : msg
        )
      )
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter = перенос строки
    if (e.key === "Enter" && e.shiftKey) return
    // Enter = отправка
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9] text-gray-800">
  {/* HEADER */}
  <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
    <div className="flex items-center gap-3">
      <Image src={logo} alt="Over-Shop.kz" width={120} height={120} />

      {/* Добавлен отступ сверху */}
      <h1
        className={`${rubik.className} text-base md:text-lg font-medium text-gray-900 mt-3`}
      >
        Роберт - электронный помощник over
      </h1>
    </div>
    <span className="text-sl text-gray-500">Поддержка онлайн</span>
  </header>

      {/* CHAT */}
      <main
        className={`flex-1 overflow-y-auto transition-all duration-300 px-4 md:px-24 ${
          messages.length === 0 ? "flex items-center justify-center" : "py-6 space-y-6"
        }`}
      >
        {messages.length === 0 ? (
          <TypingIntro text="Привет! Что на сегодня?" />
        ) : (
          messages.map((m, i) => (
            <div key={i} className="space-y-2">
              {/* user */}
              <div className="flex justify-end">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl max-w-[70%]">
                  <p className="whitespace-pre-line">{m.user}</p>
                  {m.file && (
                    <p className="text-xs opacity-80 mt-1">📎 {m.file}</p>
                  )}
                </div>
              </div>

              {/* bot */}
              {m.bot && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl max-w-[70%] text-gray-800 shadow-sm">
                    <p className="whitespace-pre-line">{m.bot}</p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl italic text-sm text-gray-600">
              Роберт печатает{typingDots}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* INPUT AREA */}
      <footer
        className={`p-4 border-t border-gray-200 bg-white flex items-end gap-3 transition-all duration-300 ${
          messages.length === 0 ? "md:mb-20" : ""
        }`}
      >
        {/* FILE */}
        <label className="cursor-pointer text-xl text-gray-500 hover:text-gray-700 transition">
          📎
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
        </label>

        {/* TEXTAREA */}
        <textarea
          ref={textareaRef}
          className="flex-1 bg-gray-50 border border-gray-300 rounded-2xl px-4 py-2 text-gray-800 focus:ring-2 focus:ring-gray-400 outline-none resize-none max-h-48 overflow-y-auto"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Введите сообщение..."
        />

        {/* SEND */}
        <button
          onClick={sendMessage}
          disabled={loading}
          className={`flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition ${
            loading ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          ➤
        </button>
      </footer>
    </div>
  )
}
