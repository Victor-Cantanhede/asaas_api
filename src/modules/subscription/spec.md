# Módulo de Assinaturas (SubscriptionModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `SubscriptionModule` gerencia o ciclo de vida completo de cobranças recorrentes (assinaturas) através do gateway Asaas v3. Ele opera de forma 100% assíncrona orientada a eventos:
- Criação de assinaturas com Cartão de Crédito (dados brutos ou token) e definição de ciclo (`WEEKLY`, `MONTHLY`, `YEARLY`, etc.)
- Alteração segura de cartão de crédito vinculado à assinatura
- Cancelamento programado de recorrência

---

## 2. 🔌 Interfaces & Portas (DIP)
- **Repositório**: `ISubscriptionRepository` (`src/modules/subscription/repositories/subscription.repository.interface.ts`)
  - `findById(id: string): Promise<Subscription | null>`
  - `findByAsaasSubscriptionId(asaasSubscriptionId: string): Promise<Subscription | null>`
  - `createInitial(data: CreateSubscriptionData): Promise<Subscription>`
  - `update(id: string, data: Partial<Subscription>): Promise<Subscription>`
  - `updateStatus(id: string, status: string, failureReason?: string | null): Promise<Subscription>`
  - Token de injeção: `SUBSCRIPTION_REPOSITORY_TOKEN`
- **Implementação**: `PrismaSubscriptionRepository` (`src/modules/subscription/repositories/prisma-subscription.repository.ts`)
- **Mensageria**: Emissão via `IEventPublisher` (`EVENT_PUBLISHER_TOKEN`)
- **Segurança & Criptografia**: `CardEncryptionService` injetado via `SecurityModule` para envelope AES-256-GCM

---

## 3. 📑 Contratos de Entrada & Saída (DTOs) & RBAC
- **Criação**: `POST /subscriptions`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `CreateSubscriptionDto` (`customerId`, `value`, `cycle`, `nextDueDate?`, `description?`, `externalReference?`, `remoteIp`, `creditCard?`, `creditCardToken?`, `creditCardHolderInfo?`)
  - Validação XSS: `@IsSafeText()` aplicado em `description`, `externalReference` e `customerId`.
  - Segurança PCI-DSS: `creditCardToken` preferencial. Se informado `creditCard`, aplica envelope criptográfico AES-256-GCM antes do despacho para a fila.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Atualização de Cartão**: `PUT /subscriptions/:id/credit-card`
  - Escopo RBAC: `@RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `UpdateSubscriptionCardDto` (`remoteIp`, `creditCard?`, `creditCardToken?`, `creditCardHolderInfo?`)
  - Segurança PCI-DSS: Dados brutos de cartão protegidos por envelope criptográfico AES-256-GCM.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Cancelamento**: `DELETE /subscriptions/:id`
  - Escopo RBAC: `@RequireScopes(ApiScope.ADMIN)` (operação privilegiada restrita a chaves administrativas)
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
- **Consulta Síncrona**: `GET /subscriptions/:id`
  - Escopo RBAC: `@RequireScopes(ApiScope.READ)`
  - DTO: `SubscriptionResponseDto` (`id`, `customerId`, `asaasSubscriptionId`, `externalReference`, `billingType`, `status`, `cycle`, `value`, `nextDueDate`, `creditCardToken`, `creditCardBrand`, `creditCardLast4`, `failureReason`, `createdAt`, `updatedAt`)

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **`subscription.create`**:
  - Payload: `{ subscriptionId: string, remoteIp: string, creditCard?: undefined, encryptedCreditCard?: string, creditCardHolderInfo?: CreditCardHolderInfoDto, creditCardToken?: string }`
  - Segurança PCI-DSS: PAN e CVV são omitidos da mensagem em texto claro; apenas o envelope cifrado `encryptedCreditCard` trafega no broker.
  - Consumer: `SubscriptionConsumer.handleCreateSubscription` (descriptografa o envelope em memória antes de chamar o use case).
- **`subscription.update_card`**:
  - Payload: `{ subscriptionId: string, remoteIp: string, creditCard?: undefined, encryptedCreditCard?: string, creditCardHolderInfo?: CreditCardHolderInfoDto, creditCardToken?: string }`
  - Consumer: `SubscriptionConsumer.handleUpdateSubscriptionCard` (descriptografa o envelope em memória antes de chamar o use case).
- **`subscription.cancel`**:
  - Payload: `{ subscriptionId: string }`
  - Consumer: `SubscriptionConsumer.handleCancelSubscription`
- **Notificação**: `webhook.forward_to_client` emitido em cada transição para notificar backends consumidores.

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **`ProcessCreateSubscriptionUseCase`**:
  1. Localiza assinatura e cliente.
  2. Submete `POST /v3/subscriptions` com ciclo, valor e cartão/token.
  3. Atualiza entidade no PostgreSQL com `asaasSubscriptionId`, status `ACTIVE` e token gerado.
- **`ProcessUpdateSubscriptionCardUseCase`**:
  1. Submete `PUT /v3/subscriptions/:id/creditCard` no Asaas.
  2. Atualiza os dados de cartão e token na base local.
- **`ProcessCancelSubscriptionUseCase`**:
  1. Executa `DELETE /v3/subscriptions/:id` no Asaas.
  2. Atualiza status da assinatura local para `INACTIVE`.
- **`GetSubscriptionUseCase`**:
  1. Busca registro por UUID no banco local com `NotFoundException`.

---

## 6. 🛡️ Resiliência, Edge Cases & Segurança
- **Conformidade PCI-DSS**: Criptografia de envelope AES-256-GCM para trânsito no RabbitMQ e incentivo a `creditCardToken`.
- **Prevenção de Stored XSS**: Validação rigorosa com `@IsSafeText()`.
- **Operações Críticas Protegidas**: Cancelamento de assinatura (`DELETE`) restrito ao escopo `admin`.
- **Falha de Validação Asaas (400)**: Registra status `FAILED` ou falha descritiva em `failureReason`, notifica `SUBSCRIPTION_FAILED` e faz `ack()` no canal.
- **Falha Transitória (5xx / Rede)**: Efetua `nack(msg, false, true)` para reprocessamento resiliente pelo RabbitMQ.

---

## 7. 🧪 Matriz de Testes Unitários
- `tests/subscription.controller.spec.ts`: POST, PUT e DELETE retornando 202 com eventos corretos e cifragem segura do cartão.
- `tests/subscription.consumer.spec.ts`: Recepção dos 3 eventos, decriptografia de `encryptedCreditCard`, delegação aos use-cases e manual ack/nack.
- `tests/process-create-subscription.use-case.spec.ts`: Criação no Asaas, tokenização e tratamento de erro.
- `tests/process-update-subscription-card.use-case.spec.ts`: Troca de cartão no Asaas e banco.
- `tests/process-cancel-subscription.use-case.spec.ts`: DELETE no Asaas e status INACTIVE.
- `tests/get-subscription.use-case.spec.ts`: Consulta síncrona e tratamento de não-encontrado.
