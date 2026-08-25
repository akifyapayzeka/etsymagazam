-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('RESEARCHING', 'DRAFT', 'IN_PRODUCTION', 'IN_QA', 'QA_FAILED', 'IP_REJECTED', 'READY_TO_PUBLISH', 'PUBLISHED', 'OPTIMIZING', 'DEACTIVATED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "IpRiskLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ListingState" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SOLD_OUT', 'EXPIRED', 'REJECTED_BY_ETSY');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('RUNNING', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('P0', 'P1', 'P2');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "etsy_shop_id" TEXT,
    "shop_name" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etsy_connections" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_refreshed_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etsy_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'RESEARCHING',
    "opportunity_id" TEXT,
    "design_family" TEXT,
    "parent_product_id" TEXT,
    "current_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "source_dir" TEXT NOT NULL,
    "customer_files" JSONB NOT NULL,
    "listing_images" JSONB NOT NULL,
    "mockups" JSONB NOT NULL,
    "metadata_json" JSONB NOT NULL,
    "seo_json" JSONB,
    "qa_report_json" JSONB,
    "license_text" TEXT,
    "design_prompt_version" TEXT,
    "generation_cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_research" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "raw_data" JSONB NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "research_id" TEXT,
    "demand_score" INTEGER,
    "competition_score" INTEGER,
    "search_volume_hint" TEXT,
    "seasonal_peak_months" INTEGER[],
    "last_evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "keyword_id" TEXT,
    "title" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "demand_score" INTEGER NOT NULL,
    "competition_score" INTEGER NOT NULL,
    "margin_score" INTEGER NOT NULL,
    "automation_suitability" INTEGER NOT NULL,
    "seasonality_score" INTEGER NOT NULL,
    "ip_risk_score" INTEGER NOT NULL,
    "opportunity_score" INTEGER NOT NULL,
    "reasoning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_decisions" (
    "id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "agent_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "data_used" JSONB NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_reports" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_version_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "design_score" INTEGER NOT NULL,
    "technical_score" INTEGER NOT NULL,
    "seo_score" INTEGER NOT NULL,
    "originality_score" INTEGER NOT NULL,
    "policy_safety_score" INTEGER NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "issues" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_checks" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_version_id" TEXT NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "risk_level" "IpRiskLevel" NOT NULL,
    "matched_terms" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_version_id" TEXT NOT NULL,
    "etsy_listing_id" TEXT,
    "state" "ListingState" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "price_amount" DECIMAL(10,2) NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "taxonomy_id" INTEGER,
    "attributes" JSONB,
    "who_made" TEXT NOT NULL DEFAULT 'i_did',
    "when_made" TEXT NOT NULL DEFAULT 'made_to_order',
    "is_digital" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "ai_disclosure" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_assets" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "etsy_image_id" TEXT,
    "rank" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_files" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "etsy_file_id" TEXT,
    "rank" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etsy_orders" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "etsy_receipt_id" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "status" TEXT NOT NULL,
    "grand_total" DECIMAL(10,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "is_refunded" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etsy_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etsy_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "etsy_transaction_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etsy_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'etsy',
    "event_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gross_revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimated_etsy_fees" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ai_costs" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "estimated_taxes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimated_net" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER,
    "views" INTEGER,
    "favorites" INTEGER,
    "products_generated" INTEGER NOT NULL DEFAULT 0,
    "products_published" INTEGER NOT NULL DEFAULT 0,
    "products_rejected" INTEGER NOT NULL DEFAULT 0,
    "products_optimized" INTEGER NOT NULL DEFAULT 0,
    "products_deactivated" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_metrics" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "date" DATE NOT NULL,
    "views" INTEGER,
    "visits" INTEGER,
    "favorites" INTEGER,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refunds" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "conversion_rate" DOUBLE PRECISION,
    "revenue_per_visitor" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_changes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "old_price" DECIMAL(10,2) NOT NULL,
    "new_price" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'RUNNING',
    "conclusion" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_costs" (
    "id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "product_version_id" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "images_generated" INTEGER,
    "cost_usd" DECIMAL(10,5) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "priority" "AlertPriority" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "notified_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_events" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "lead_time_days" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasonal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autopilot_state" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "paused_at" TIMESTAMP(3),
    "paused_reason" TEXT,
    "auto_publish" BOOLEAN NOT NULL DEFAULT false,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "max_products_per_day" INTEGER NOT NULL DEFAULT 3,
    "max_products_per_week" INTEGER NOT NULL DEFAULT 10,
    "qa_min_score" INTEGER NOT NULL DEFAULT 90,
    "ip_risk_reject_threshold" INTEGER NOT NULL DEFAULT 40,
    "min_price" DECIMAL(10,2) NOT NULL DEFAULT 3.00,
    "max_price" DECIMAL(10,2) NOT NULL DEFAULT 45.00,
    "max_daily_price_change" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autopilot_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_etsy_shop_id_key" ON "shops"("etsy_shop_id");

-- CreateIndex
CREATE INDEX "etsy_connections_shop_id_idx" ON "etsy_connections"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_current_version_id_key" ON "products"("current_version_id");

-- CreateIndex
CREATE INDEX "products_shop_id_status_idx" ON "products"("shop_id", "status");

-- CreateIndex
CREATE INDEX "products_design_family_idx" ON "products"("design_family");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_version_number_key" ON "product_versions"("product_id", "version_number");

-- CreateIndex
CREATE INDEX "product_research_keyword_idx" ON "product_research"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_keyword_key" ON "keywords"("keyword");

-- CreateIndex
CREATE INDEX "opportunities_status_opportunity_score_idx" ON "opportunities"("status", "opportunity_score");

-- CreateIndex
CREATE INDEX "agent_runs_agent_name_status_idx" ON "agent_runs"("agent_name", "status");

-- CreateIndex
CREATE INDEX "agent_decisions_entity_type_entity_id_idx" ON "agent_decisions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "agent_decisions_agent_name_created_at_idx" ON "agent_decisions"("agent_name", "created_at");

-- CreateIndex
CREATE INDEX "qa_reports_product_id_idx" ON "qa_reports"("product_id");

-- CreateIndex
CREATE INDEX "ip_checks_product_id_idx" ON "ip_checks"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "listings_etsy_listing_id_key" ON "listings"("etsy_listing_id");

-- CreateIndex
CREATE INDEX "listings_product_id_idx" ON "listings"("product_id");

-- CreateIndex
CREATE INDEX "listings_state_idx" ON "listings"("state");

-- CreateIndex
CREATE INDEX "listing_assets_listing_id_idx" ON "listing_assets"("listing_id");

-- CreateIndex
CREATE INDEX "digital_files_listing_id_idx" ON "digital_files"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "etsy_orders_etsy_receipt_id_key" ON "etsy_orders"("etsy_receipt_id");

-- CreateIndex
CREATE INDEX "etsy_orders_shop_id_idx" ON "etsy_orders"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "etsy_order_items_etsy_transaction_id_key" ON "etsy_order_items"("etsy_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_shop_id_date_key" ON "daily_metrics"("shop_id", "date");

-- CreateIndex
CREATE INDEX "product_metrics_listing_id_date_idx" ON "product_metrics"("listing_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "product_metrics_product_id_date_key" ON "product_metrics"("product_id", "date");

-- CreateIndex
CREATE INDEX "alerts_status_priority_idx" ON "alerts"("status", "priority");

-- CreateIndex
CREATE INDEX "automation_runs_name_started_at_idx" ON "automation_runs"("name", "started_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "autopilot_state_shop_id_key" ON "autopilot_state"("shop_id");

-- AddForeignKey
ALTER TABLE "etsy_connections" ADD CONSTRAINT "etsy_connections_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "product_research"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_reports" ADD CONSTRAINT "qa_reports_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_reports" ADD CONSTRAINT "qa_reports_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_checks" ADD CONSTRAINT "ip_checks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_checks" ADD CONSTRAINT "ip_checks_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_assets" ADD CONSTRAINT "listing_assets_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_files" ADD CONSTRAINT "digital_files_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etsy_orders" ADD CONSTRAINT "etsy_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etsy_order_items" ADD CONSTRAINT "etsy_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "etsy_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etsy_order_items" ADD CONSTRAINT "etsy_order_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_metrics" ADD CONSTRAINT "product_metrics_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_metrics" ADD CONSTRAINT "product_metrics_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_costs" ADD CONSTRAINT "generation_costs_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_costs" ADD CONSTRAINT "generation_costs_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_events" ADD CONSTRAINT "seasonal_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autopilot_state" ADD CONSTRAINT "autopilot_state_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
