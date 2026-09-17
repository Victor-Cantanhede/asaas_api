-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "credit_card_brand" TEXT,
ADD COLUMN     "credit_card_last4" TEXT,
ADD COLUMN     "credit_card_token" TEXT,
ADD COLUMN     "escrow_finish_date" TIMESTAMP(3),
ADD COLUMN     "escrow_status" TEXT;

-- CreateTable
CREATE TABLE "subaccounts" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "asaas_account_id" TEXT,
    "wallet_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf_cnpj" TEXT NOT NULL,
    "phone" TEXT,
    "mobile_phone" TEXT,
    "income_value" DOUBLE PRECISION,
    "address" TEXT,
    "address_number" TEXT,
    "province" TEXT,
    "postal_code" TEXT,
    "company_type" TEXT,
    "escrow_enabled" BOOLEAN NOT NULL DEFAULT false,
    "escrow_days_to_expire" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subaccounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subaccounts_external_id_key" ON "subaccounts"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "subaccounts_asaas_account_id_key" ON "subaccounts"("asaas_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "subaccounts_wallet_id_key" ON "subaccounts"("wallet_id");

-- CreateIndex
CREATE INDEX "subaccounts_status_idx" ON "subaccounts"("status");
