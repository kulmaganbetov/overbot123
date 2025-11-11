"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Orbitron, Rubik } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "500"] });
const rubik = Rubik({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";

type ChatMessage = {
  user: string;
  bot: string;
  time: string;
  products?: {
    sku: string;
    name: string;
    brand: string;
    price: number;
  }[];
};

function TypingIntro({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i === text.length) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [text]);
  return (
    <div className="text-center text-gray-600 text-lg font-normal tracking-wide">
      {displayed}
      <span className="animate-pulse">▌</span>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingDots, setTypingDots] = useState(".");
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Инициализация session_key
  useEffect(() => {
    let key = localStorage.getItem("session_key");
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem("session_key", key);
    }
    setSessionKey(key);
  }, []);

  // typing animation
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setTypingDots((prev) => (prev.length < 3 ? prev + "." : "."));
    }, 500);
    return () => clearInterval(interval);
  }, [loading]);

  // scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // auto height for textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [input]);

  async function sendMessage() {
    if (!input.trim()) return;
    const question = input;
    const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const newMsg: ChatMessage = { user: question, bot: "", time };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chat/message/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          session_key: sessionKey,
        }),
      });

      const data = await response.json();

      // 🧠 Собираем товары, если они есть
      const products = data.data?.pc_build?.components
        ? Object.values(data.data.pc_build.components).map((item: any) => ({
            sku: item.sku,
            name: item.name,
            brand: item.brand,
            price: item.price,
          }))
        : [];

      const botTime = new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      setMessages((prev) =>
        prev.map((msg, i) =>
          i === prev.length - 1
            ? { ...msg, bot: data.response, time: `${msg.time} / ${botTime}`, products }
            : msg
        )
      );
    } catch (err) {
      console.error("Ошибка:", err);
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === prev.length - 1
            ? { ...msg, bot: "⚠️ Ошибка при получении ответа от Роберта." }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyPress(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.shiftKey) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9] text-gray-800">
      {/* HEADER */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <Image src="/logo2.svg" alt="Over-Shop.kz" width={120} height={120} priority />
          <h1 className={`${rubik.className} text-base md:text-lg font-medium text-gray-900 mt-3`}>
            Роберт — электронный помощник over
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
                </div>
              </div>

              {/* bot */}
              {m.bot && (
                <div className="flex flex-col items-start gap-2">
                  <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl max-w-[70%] text-gray-800 shadow-sm">
                    <p className="whitespace-pre-line">{m.bot}</p>
                  </div>

                  {/* карточки товаров */}
                  {m.products && m.products.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {m.products.map((p) => (
                        <div
                          key={p.sku}
                          className="border border-gray-200 bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition"
                        >
                          <h3 className="font-semibold text-gray-800 text-sm">{p.name}</h3>
                          <p className="text-xs text-gray-500">{p.brand}</p>
                          <p className="text-blue-600 font-medium mt-1">
                            {p.price.toLocaleString()} ₸
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
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
      <footer className="p-4 border-t border-gray-200 bg-white flex items-end gap-3">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-gray-50 border border-gray-300 rounded-2xl px-4 py-2 text-gray-800 focus:ring-2 focus:ring-gray-400 outline-none resize-none max-h-48 overflow-y-auto"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Введите сообщение..."
        />

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
  );
}
