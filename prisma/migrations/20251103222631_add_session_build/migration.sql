-- CreateTable
CREATE TABLE "SessionBuild" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionBuild_sessionId_key" ON "SessionBuild"("sessionId");
