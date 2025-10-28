// app/api/products/route.ts
import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") || "").toLowerCase()

  const file = path.join(process.cwd(), "public", "dealer.json")
  if (!fs.existsSync(file)) return NextResponse.json({ error: "dealer.json not found" }, { status: 404 })

  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  const filtered = q
    ? data.filter((p: any) =>
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      )
    : data.slice(0, 50)

  return NextResponse.json({ count: filtered.length, products: filtered })
}
