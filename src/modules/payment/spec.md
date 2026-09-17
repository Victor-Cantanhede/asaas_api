# Módulo de Pagamentos (PaymentModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `PaymentModule` gerencia o ciclo de vida completo de cobranças financeiras avulsas e parceladas através do gateway Asaas v3. Ele implementa o processamento 100% assíncrono e orientado a eventos de:
1. **Cobranças PIX**: geração de cobrança imediata, smart split e captura de QR Code (Base64) e Copia-e-Cola.
2. **Cartão de Crédito**: débito avulso, parcelamento (até 12x), tokenização reutilizável (`creditCardToken`) e envio obrigatório do IP de antifraude (`remoteIp`).
3. **Smart Split com DX Amigável**: divisão de valores por `walletId` do Asaas ou diretamente por `subaccountExternalId` (resolvido automaticamente em tempo de execução).
4. **Custódia / Escrow (Garantia de Valores)**: retenção temporária do saldo na subconta até a liberação do serviço/produto, com encerramento de garantia e consulta síncrona.

---

## 2. 🔌 Interfaces & Portas (DIP)
- **Repositório**: `IPaymentRepository` (`src/modules/payment/repositories/payment.repository.interface.ts`)
  - `findById(id: string): Promise<Payment | null>`
  - `findByExternalReference(externalReference: string): Promise<Payment | null>`
  - `findByAsaasPaymentId(asaasPaymentId: string): Promise<Payment | null>`
  - `createInitial(data: CreatePaymentData): Promise<Payment>`
  - `update(id: string, data: Partial<Payment>): Promise<Payment>`
  - `updateStatus(id: string, status: string, failureReason?: string | null): Promise<Payment>`
  - Token de injeção: `PAYMENT_REPOSITORY_TOKEN`
- **Implementação**: `PrismaPaymentRepository` (`src/modules/payment/repositories/prisma-payment.repository.ts`)
- **Mensageria**: Emissão via `IEventPublisher` (`EVENT_PUBLISHER_TOKEN`)
- **Segurança & Criptografia**: `CardEncryptionService` injetado via `SecurityModule` para envelope AES-256-GCM
- **Subcontas (Resolução de Split DX)**: `ISubaccountRepository` (`SUBACCOUNT_REPOSITORY_TOKEN`, opcionalmente injetado)

---

## 3. 📑 Contratos de Entrada & Saída (DTOs) & RBAC
- **Entrada PIX**: `POST /payments/pix`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `CreatePixPaymentDto` (`customerId`, `value`, `dueDate?`, `description?`, `externalReference?`, `split?`)
  - DX Split: `PaymentSplitItemDto` aceita `subaccountExternalId` (UUID/ID de negócio do dev) ou `walletId`.
  - Validação XSS: `@IsSafeText()` aplicado em `description`, `externalReference` e `customerId`.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Entrada Cartão de Crédito**: `POST /payments/credit-card`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `CreateCreditCardPaymentDto` (`customerId`, `value`, `remoteIp`, `installmentCount?`, `dueDate?`, `description?`, `externalReference?`, `creditCard?`, `creditCardHolderInfo?`, `creditCardToken?`, `split?`)
  - Regra & PCI-DSS: Obrigatório fornecer ou `creditCardToken` (recomendado PCI-DSS) ou `creditCard` (fallback). Quando dados brutos de cartão forem enviados, o controller aplica criptografia de envelope AES-256-GCM antes da fila.
  - Validação XSS: `@IsSafeText()` em `description`, `externalReference` e dados textuais.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Liberação de Custódia (Escrow)**: `POST /payments/:id/escrow/release`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - Identificador Polimórfico: `:id` aceita tanto o UUID local do pagamento quanto o `externalReference` do integrador.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Consulta de Custódia (Escrow)**: `GET /payments/:id/escrow`
  - Escopo RBAC: `@RequireScopes(ApiScope.READ)`
  - Retorno: `{ paymentId, externalReference, escrowStatus, escrowFinishDate }`
- **Saída (Consulta Síncrona / Polling Geral)**: `GET /payments/:id`
  - Escopo RBAC: `@RequireScopes(ApiScope.READ)`
  - DTO: `PaymentDetailsResponseDto` (`id`, `customerId`, `asaasPaymentId`, `billingType`, `status`, `value`, `netValue`, `dueDate`, `invoiceUrl`, `externalReference`, `pixQrCodeBase64`, `pixPayload`, `pixExpirationDate`, `escrowStatus`, `escrowFinishDate`, `creditCardToken`, `creditCardBrand`, `creditCardLast4`, `failureReason`, `createdAt`, `updatedAt`)

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **`payment.create_pix`**:
  - Payload: `{ paymentId: string }`
  - Consumer: `PaymentPixConsumer`
- **`payment.charge_credit_card`**:
  - Payload: `{ paymentId: string, remoteIp: string, installmentCount?: number, creditCard?: undefined, encryptedCreditCard?: string, creditCardHolderInfo?: CreditCardHolderInfoDto, creditCardToken?: string }`
  - Segurança PCI-DSS: O campo `creditCard` em texto puro é **anulado**. Os dados sensíveis trafegam no broker estritamente cifrados em `encryptedCreditCard` (`iv:authTag:ciphertext`).
  - Consumer: `PaymentCreditCardConsumer` (descriptografa o envelope em memória imediatamente antes de invocar o use-case).
- **`payment.release_escrow`**:
  - Payload: `{ paymentId: string }`
  - Consumer: `PaymentEscrowConsumer`
- **`webhook.forward_to_client`**:
  - Disparado após processamento para notificar o backend consumidor (`PAYMENT_CONFIRMED`, `PAYMENT_CREATED`, `PAYMENT_FAILED` ou `ESCROW_RELEASED`).

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **`ProcessPixPaymentUseCase`**:
  1. Localiza o pagamento e garante sincronização do cliente (`asaasCustomerId`).
  2. Resolve itens de split: se fornecido `subaccountExternalId`, mapeia para `walletId` via `ISubaccountRepository`.
  3. Submete `POST /v3/payments` com `billingType: 'PIX'`.
  4. Consulta `GET /v3/payments/:id/pixQrCode` para obter imagem e payload copia-e-cola.
  5. Atualiza registro para `PENDING` com dados do QR Code e status de `escrowStatus`.
- **`ProcessCreditCardPaymentUseCase`**:
  1. Localiza pagamento e sincroniza cliente.
  2. Resolve split por `subaccountExternalId` se aplicável.
  3. Se informado `creditCardToken`, utiliza débito tokenizado diretamente.
  4. Se informados dados do cartão (descriptografados pelo consumer), envia `creditCard` e `creditCardHolderInfo`.
  5. Calcula parcelamento se `installmentCount > 1`.
  6. Envia `remoteIp` para o antifraude do Asaas.
  7. Ao receber confirmação do Asaas, atualiza status para `CONFIRMED`, persiste dados do cartão/token e `escrowStatus`.
  8. Publica notificação em `webhook.forward_to_client`.
- **`ProcessReleaseEscrowUseCase`**:
  1. Localiza cobrança polimorficamente por UUID local ou `externalReference`.
  2. Invoca endpoint oficial do Asaas `POST /v3/payments/{id}/escrow` para liberar a retenção de valores.
  3. Atualiza `escrowStatus` para `FINISHED` e grava `escrowFinishDate`.
  4. Publica notificação com evento `ESCROW_RELEASED` no RabbitMQ para encaminhamento ao cliente via webhook.
- **`GetPaymentUseCase`**: Consulta síncrona com lançamento de `NotFoundException`.

---

## 6. 🛡️ Resiliência, Edge Cases & Segurança
- **Conformidade PCI-DSS Requisitos 3 e 4**: Proibição de PAN e CVV em texto claro em filas e logs. Uso de envelope AES-256-GCM e incentivo à tokenização client-side.
- **Prevenção de Stored XSS**: Decorator `@IsSafeText()` bloqueia tags `<script>`, manipuladores HTML e caracteres `<` e `>` nos campos descritivos.
- **Recusa de Cartão (400 Asaas / Transação Negada)**: Registra status `FAILED`, armazena justificativa em `failureReason`, notifica em `webhook.forward_to_client` e faz `channel.ack(msg)` para não reprocessar cartão negado.
- **Falha de Conectividade / 5xx Asaas**: Marca status `FAILED` e dispara `channel.nack(msg, false, true)` para retentativa no broker.
- **Confirmação Manual**: Todos os consumers (`PaymentPixConsumer`, `PaymentCreditCardConsumer`, `PaymentEscrowConsumer`) utilizam manual ack (`noAck: false`).

---

## 7. 🧪 Matriz de Testes Unitários
- `tests/payment.controller.spec.ts`: Despacho assíncrono para PIX, Cartão de Crédito e Liberação de Escrow, respostas 202 Accepted, consulta de status de custódia e teste de envelope criptográfico do cartão.
- `tests/payment-pix.consumer.spec.ts`: Consumo do evento PIX com ack/nack.
- `tests/payment-credit-card.consumer.spec.ts`: Consumo do evento Cartão de Crédito com ack/nack e decriptografia de `encryptedCreditCard`.
- `tests/payment-escrow.consumer.spec.ts`: Consumo do evento de liberação de custódia com ack/nack.
- `tests/process-pix-payment.use-case.spec.ts`: Integração PIX, QR Code, resolução automática de `subaccountExternalId` no split e status de custódia.
- `tests/process-credit-card-payment.use-case.spec.ts`: Cartão bruto vs token, parcelamento, resolução de split e persistência de dados de token/custódia.
- `tests/process-release-escrow.use-case.spec.ts`: Chamada à API de encerramento de garantia no Asaas, idempotência, busca polimórfica e evento `ESCROW_RELEASED`.
- `tests/get-payment.use-case.spec.ts`: Busca por ID e tratamento de registro não encontrado.
