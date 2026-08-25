-- CreateEnum
CREATE TYPE "PublishStepStatus" AS ENUM ('PENDING', 'LISTING_CREATED', 'ASSETS_UPLOADED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "publish_states" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_version_id" TEXT NOT NULL,
    "status" "PublishStepStatus" NOT NULL DEFAULT 'PENDING',
    "etsy_listing_id" TEXT,
    "images_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "files_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "activated" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publish_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publish_states_product_version_id_key" ON "publish_states"("product_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_states_etsy_listing_id_key" ON "publish_states"("etsy_listing_id");

-- AddForeignKey
ALTER TABLE "publish_states" ADD CONSTRAINT "publish_states_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
