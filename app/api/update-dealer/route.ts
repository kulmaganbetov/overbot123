// app/api/update-dealer/route.ts
import { NextResponse } from "next/server"
import { updateDealerFile } from "@/scripts/updateDealer"

export async function GET() {
  try {
    await updateDealerFile()
    return NextResponse.json({ status: "ok", updated: new Date().toISOString() })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
