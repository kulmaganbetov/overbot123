"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import logo from "@/../public/logo2.svg"
import { Orbitron } from "next/font/google"

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500"],
})

const EMOJIS = ["😀", "😂", "🤔", "😎", "😍", "😅", "🔥", "👏", "💡", "👍"]

export default function Home() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<
    { user: string; bot: string; time: string; file?: string; reaction?: string }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [typingDots, setTypingDots] = useState(".")
  const [file, setFile] = useState<File | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setTypingDots((prev) => (prev.length < 3 ? prev + "." : "."))
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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
      const text = await res.text()
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
            ? { ...msg, bot: "⚠️ Ошибка при получении ответа от Роберта." }
            : msg
        )
      )
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function addEmoji(emoji: string) {
    setInput((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }

  function addReaction(index: number, emoji: string) {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, reaction: emoji } : m))
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-orange-50 via-orange-100 to-white p-4">
      <div className="w-full max-w-lg bg-white shadow-2xl rounded-2xl p-6 flex flex-col h-[85vh] border border-orange-200">

        {/* HEADER */}
        <div className="flex flex-col items-center mb-5 border-b border-orange-200 pb-4">
          <div className="relative">
            <div className="absolute inset-0 blur-lg bg-orange-400/40 rounded-full scale-125"></div>
            <Image src={logo} alt="Over-Shop.kz Logo" width={150} height={150} className="relative drop-shadow-md" priority />
          </div>
          <h1 className={`${orbitron.className} text-3xl md:text-xl font-extrabold text-orange-600 mt-2 text-center leading-tight tracking-wide`}>
            🤖 Роберт — электронный помощник<br />
            <span className="text-gray-700 text-lg md:text-l tracking-tight">Over-Shop.kz</span>
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
                  {m.file && (
                    <a href="#" className="text-xs underline text-white/90 block mt-1">
                      📎 {m.file}
                    </a>
                  )}
                  <p className="text-xs opacity-70 text-right mt-1">{m.time.split("/")[0]}</p>
                  {m.reaction && <p className="text-right text-lg">{m.reaction}</p>}
                </div>
              </div>

              {/* bot */}
              {m.bot && (
                <div className="flex flex-col justify-start mt-2">
                  <div className="bg-gray-100 text-gray-800 p-3 rounded-2xl rounded-bl-none max-w-[80%] break-words">
                    <p className="whitespace-pre-line">{m.bot}</p>
                    <p className="text-xs opacity-70 text-left mt-1">{m.time.split("/")[1] || ""}</p>
                  </div>

                  {/* быстрые эмодзи-реакции */}
                  <div className="flex gap-1 mt-1 ml-2">
                    {["👍", "😂", "🔥", "❤️"].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(i, emoji)}
                        className="text-lg hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start mt-2">
              <div className="bg-gray-100 text-gray-800 p-3 rounded-2xl rounded-bl-none max-w-[70%] italic text-sm">
                Роберт печатает{typingDots}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT + FILE + EMOJI */}
        <div className="flex gap-2 items-center mt-auto relative">
          {/* FILE */}
          <label className="cursor-pointer bg-orange-100 border border-orange-300 rounded-full px-3 py-2 hover:bg-orange-200 transition">
            📎
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          {/* EMOJI PICKER */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker((p) => !p)}
              className="text-2xl px-2 hover:scale-110 transition-transform"
            >
              😀
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-10 left-0 bg-white border rounded-lg shadow-md p-2 flex flex-wrap gap-1 w-48">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addEmoji(emoji)}
                    className="text-xl hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TEXTAREA */}
          <textarea
            className="flex-1 border border-orange-300 rounded-2xl px-4 py-2 focus:ring-2 focus:ring-orange-400 outline-none text-gray-800 placeholder-gray-400 bg-white resize-none"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Напиши сообщение Роберту... (Shift + Enter — новая строка)"
          />

          {/* SEND */}
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

        {/* SELECTED FILE */}
        {file && (
          <p className="text-sm text-gray-600 mt-2 text-center">
            📄 Прикреплён файл: <span className="font-medium">{file.name}</span>
          </p>
        )}
      </div>
    </div>
  )
}
