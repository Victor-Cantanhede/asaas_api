# Módulo de Pagamentos (PaymentModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `PaymentModule` gerencia o ciclo de vida completo de cobranças financeiras avulsas e parceladas através do gateway Asaas v3. Ele implementa o processamento 100% assíncrono e orientado a eventos de:
1. **Cobranças PIX**: geração de cobrança imediata, split e captura de QR Code (Base64) e Copia-e-Cola.
2. **Cartão de Crédito**: débito avulso, parcelamento (até 12x), tokenização reutilizável (`creditCardToken`) e envio obrigatório do IP de antifraude (`remoteIp`).

---

## 2. 🔌 Interfaces & Portas (DIP)
- **Repositório**: `IPaymentRepository` (`src/modules/payment/repositories/payment.repository.interface.ts`)
  - `findById(id: string): Promise<Payment | null>`
  - `findByAsaasPaymentId(asaasPaymentId: string): Promise<Payment | null>`
  - `createInitial(data: CreatePaymentData): Promise<Payment>`
  - `update(id: string, data: Partial<Payment>): Promise<Payment>`
  - `updateStatus(id: string, status: string, failureReason?: string | null): Promise<Payment>`
  - Token de injeção: `PAYMENT_REPOSITORY_TOKEN`
- **Implementação**: `PrismaPaymentRepository` (`src/modules/payment/repositories/prisma-payment.repository.ts`)
- **Mensageria**: Emissão via `IEventPublisher` (`EVENT_PUBLISHER_TOKEN`)
- **Segurança & Criptografia**: `CardEncryptionService` injetado via `SecurityModule` para envelope AES-256-GCM

---

## 3. 📑 Contratos de Entrada & Saída (DTOs) & RBAC
- **Entrada PIX**: `POST /payments/pix`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `CreatePixPaymentDto` (`customerId`, `value`, `dueDate?`, `description?`, `externalReference?`, `split?`)
  - Validação XSS: `@IsSafeText()` aplicado em `description`, `externalReference` e `customerId`.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Entrada Cartão de Crédito**: `POST /payments/credit-card`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `CreateCreditCardPaymentDto` (`customerId`, `value`, `remoteIp`, `installmentCount?`, `dueDate?`, `description?`, `externalReference?`, `creditCard?`, `creditCardHolderInfo?`, `creditCardToken?`, `split?`)
  - Regra & PCI-DSS: Obrigatório fornecer ou `creditCardToken` (recomendado PCI-DSS) ou `creditCard` (fallback). Quando dados brutos de cartão forem enviados, o controller aplica criptografia de envelope AES-256-GCM antes da fila.
  - Validação XSS: `@IsSafeText()` em `description`, `externalReference` e dados textuais.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Saída (Consulta Síncrona / Polling)**: `GET /payments/:id`
  - Escopo RBAC: `@RequireScopes(ApiScope.READ)`
  - DTO: `PaymentDetailsResponseDto` (`id`, `customerId`, `asaasPaymentId`, `billingType`, `status`, `value`, `netValue`, `dueDate`, `invoiceUrl`, `externalReference`, `pixQrCodeBase64`, `pixPayload`, `pixExpirationDate`, `failureReason`, `createdAt`, `updatedAt`)

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **`payment.create_pix`**:
  - Payload: `{ paymentId: string }`
  - Consumer: `PaymentPixConsumer`
- **`payment.charge_credit_card`**:
  - Payload: `{ paymentId: string, remoteIp: string, installmentCount?: number, creditCard?: undefined, encryptedCreditCard?: string, creditCardHolderInfo?: CreditCardHolderInfoDto, creditCardToken?: string }`
  - Segurança PCI-DSS: O campo `creditCard` em texto puro é **anulado**. Os dados sensíveis trafegam no broker estritamente cifrados em `encryptedCreditCard` (`iv:authTag:ciphertext`).
  - Consumer: `PaymentCreditCardConsumer` (descriptografa o envelope em memória imediatamente antes de invocar o use-case).
- **`webhook.forward_to_client`**:
  - Disparado após processamento para notificar o backend consumidor (`PAYMENT_CONFIRMED`, `PAYMENT_CREATED` ou `PAYMENT_FAILED`).

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **`ProcessPixPaymentUseCase`**:
  1. Localiza o pagamento e garante sincronização do cliente (`asaasCustomerId`).
  2. Submete `POST /v3/payments` com `billingType: 'PIX'`.
  3. Consulta `GET /v3/payments/:id/pixQrCode` para obter imagem e payload copia-e-cola.
  4. Atualiza registro para `PENDING` com dados do QR Code.
- **`ProcessCreditCardPaymentUseCase`**:
  1. Localiza pagamento e sincroniza cliente.
  2. Se informado `creditCardToken`, utiliza débito tokenizado diretamente.
  3. Se informados dados do cartão (descriptografados pelo consumer), envia `creditCard` e `creditCardHolderInfo`.
  4. Calcula parcelamento se `installmentCount > 1`.
  5. Envia `remoteIp` para o antifraude do Asaas.
  6. Ao receber confirmação do Asaas, atualiza status para `CONFIRMED` e persiste dados do cartão/token.
  7. Publica notificação em `webhook.forward_to_client`.
- **`GetPaymentUseCase`**: Consulta síncrona com lançamento de `NotFoundException`.

---

## 6. 🛡️ Resiliência, Edge Cases & Segurança
- **Conformidade PCI-DSS Requisitos 3 e 4**: Proibição de PAN e CVV em texto claro em filas e logs. Uso de envelope AES-256-GCM e incentivo à tokenização client-side.
- **Prevenção de Stored XSS**: Decorator `@IsSafeText()` bloqueia tags `<script>`, manipuladores HTML e caracteres `<` e `>` nos campos descritivos.
- **Recusa de Cartão (400 Asaas / Transação Negada)**: Registra status `FAILED`, armazena justificativa em `failureReason`, notifica em `webhook.forward_to_client` e faz `channel.ack(msg)` para não reprocessar cartão negado.
- **Falha de Conectividade / 5xx Asaas**: Marca status `FAILED` e dispara `channel.nack(msg, false, true)` para retentativa no broker.
- **Confirmação Manual**: Ambos os consumers utilizam manual ack (`noAck: false`).

---

## 7. 🧪 Matriz de Testes Unitários
- `tests/payment.controller.spec.ts`: Despacho assíncrono para PIX e Cartão de Crédito, validação de parâmetros, respostas 202 Accepted e teste de cifragem segura do cartão na publicação.
- `tests/payment-pix.consumer.spec.ts`: Consumo do evento PIX com ack/nack.
- `tests/payment-credit-card.consumer.spec.ts`: Consumo do evento Cartão de Crédito com ack/nack e decriptografia de `encryptedCreditCard`.
- `tests/process-pix-payment.use-case.spec.ts`: Integração PIX e QR Code com Asaas.
- `tests/process-credit-card-payment.use-case.spec.ts`: Cartão bruto vs token, parcelamento e recusa 400.
- `tests/get-payment.use-case.spec.ts`: Busca por ID e tratamento de registro não encontrado.
