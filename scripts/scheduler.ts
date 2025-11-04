import { updateDealerFile } from "./updateDealer"

async function startScheduler() {
  console.log("🕒 Инициализация автообновления dealer.json...")

  // Первое обновление при старте
  await updateDealerFile()

  // Повтор каждые 6 часов
  const interval = 6 * 60 * 60 * 1000
  setInterval(async () => {
    console.log("🔁 Автообновление dealer.json...")
    await updateDealerFile()
  }, interval)
}

startScheduler().catch((err) => console.error("❌ Ошибка планировщика:", err))
