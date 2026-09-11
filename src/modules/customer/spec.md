# Módulo de Clientes (CustomerModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `CustomerModule` representa o Bounded Context responsável pelo ciclo de vida, identificação e sincronização de clientes entre os backends consumidores e o gateway Asaas v3. O módulo viabiliza o mapeamento bidirecional entre o `externalId` (identificador nativo do backend consumidor) e o `asaasCustomerId` (identificador oficial no Asaas: `cus_...`).

---

## 2. 🔌 Interfaces & Portas (DIP)
- **Repositório**: `ICustomerRepository` (`src/modules/customer/repositories/customer.repository.interface.ts`)
  - `findById(id: string): Promise<Customer | null>`
  - `findByExternalId(externalId: string): Promise<Customer | null>`
  - `findByAsaasCustomerId(asaasCustomerId: string): Promise<Customer | null>`
  - `upsertInitial(data: UpsertCustomerData): Promise<Customer>`
  - `updateStatus(id: string, status: string, failureReason?: string | null): Promise<Customer>`
  - `updateSynced(id: string, asaasCustomerId: string): Promise<Customer>`
  - Token de injeção: `CUSTOMER_REPOSITORY_TOKEN`
- **Implementação**: `PrismaCustomerRepository` (`src/modules/customer/repositories/prisma-customer.repository.ts`)
- **Mensageria**: Emissão via `IEventPublisher` (`EVENT_PUBLISHER_TOKEN`)

---

## 3. 📑 Contratos de Entrada & Saída (DTOs) & RBAC
- **Entrada (Comando HTTP)**: `POST /customers`
  - Escopo RBAC: `@RequireScopes(ApiScope.WRITE, ApiScope.ADMIN)`
  - DTO: `CreateOrGetCustomerDto` (`externalId`, `name`, `email`, `cpfCnpj?`, `phone?`)
  - Validação Anti-XSS: `@IsSafeText()` aplicado em `name` e `externalId`.
  - Resposta: `HTTP 202 Accepted` (`AsyncCommandTrackingDto`)
    ```json
    {
      "trackingId": "d3b07384-d113-469b-b51f-5e488d5e1b20",
      "status": "RECEIVED",
      "message": "Solicitação de sincronização de cliente enfileirada com sucesso.",
      "createdAt": "2026-09-10T15:30:00.000Z",
      "checkStatusUrl": "/customers/user_uuid_123"
    }
    ```
- **Saída (Consulta Síncrona / Polling)**: `GET /customers/:externalId`
  - Escopo RBAC: `@RequireScopes(ApiScope.READ)`
  - DTO: `CustomerResponseDto` (`id`, `externalId`, `asaasCustomerId`, `name`, `email`, `cpfCnpj`, `phone`, `status`, `failureReason`, `createdAt`, `updatedAt`)

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **Evento Emitido**: `customer.sync`
  - Payload: `{ customerId: string; externalId: string }`
  - Emitido por: `CustomerController` logo após persistir com status `RECEIVED`.
- **Consumer**: `CustomerConsumer`
  - Padrão: `@EventPattern('customer.sync')`
  - Gerenciamento de Canal: Confirmação manual (`channel.ack` em sucesso ou erro irrecuperável de validação; `channel.nack(msg, false, true)` em falhas transitórias de infraestrutura).

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **`SyncCustomerUseCase`**:
  1. Busca registro local pelo `customerId`.
  2. Consulta idempotente no Asaas por `externalReference` e `cpfCnpj` para evitar duplicação cadastral.
  3. Se já existir no Asaas, vincula o `asaasCustomerId` retornado.
  4. Se não existir, envia `POST /v3/customers` contendo `externalReference: externalId`.
  5. Atualiza o registro no PostgreSQL com status `SYNCED` e `asaasCustomerId`.
- **`GetCustomerByExternalIdUseCase`**:
  1. Busca cliente por `externalId`.
  2. Lança `NotFoundException` caso não exista no banco local.

---

## 6. 🛡️ Resiliência, Edge Cases & Segurança
- **Validação Anti-XSS**: O decorator `@IsSafeText()` impede injeções de script em campos de nome de clientes, prevenindo Stored XSS em painéis administrativos consumidores.
- **Controle de Acesso RBAC**: Chaves restritas a consultas (`API_KEY_READ`) são impedidas de emitir cadastros (`POST`), recebendo `403 Forbidden`.
- **Falha de Validação Asaas (400)**: Salva status `FAILED` com a mensagem em `failureReason` e efetua `ack()` para não sobrecarregar a fila com mensagens inválidas.
- **Falha Transitória (502 / Rede)**: Efetua `nack(msg, false, true)` permitindo reprocessamento pelo RabbitMQ.
- **Idempotência**: `externalId` possui restrição única no banco (`@unique`).

---

## 7. 🧪 Matriz de Testes Unitários
- `tests/customer.controller.spec.ts`: Despacho assíncrono, persistência de intenção e retorno 202 Accepted.
- `tests/customer.consumer.spec.ts`: Confirmação manual (`ack`) no sucesso e tratamento de erros.
- `tests/sync-customer.use-case.spec.ts`: Cliente já existente no Asaas, cliente novo e tratamento de exceção.
- `tests/get-customer-by-external-id.use-case.spec.ts`: Registro encontrado vs `NotFoundException`.
