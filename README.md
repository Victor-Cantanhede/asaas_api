# Asaas API — Gateway Financeiro Orientado a Eventos (EDA)

Microsserviço de abstração e gateway financeiro assíncrono para a API v3 do **Asaas**. Construído seguindo os padrões de **Monólito Modular**, **Arquitetura Orientada a Eventos (EDA)**, **Clean Architecture (Ports & Adapters)** e os princípios **SOLID**.

> **Modelo Arquitetural de Gateway Privado (M2M)**: Esta API opera como um componente de infraestrutura de uso exclusivo do backend consumidor da aplicação. Ela não é exposta diretamente a navegadores ou usuários finais. O gerenciamento de inquilinos (Multitenancy), organizações e autorização de usuário final reside na camada de domínio do backend consumidor, mantendo o gateway financeiro focado, desacoplado e de alta performance.

---

## 🎯 Arquitetura & Tecnologias

- **Framework**: [NestJS 11](https://nestjs.com/) (Aplicação Híbrida: HTTP Express + Microservice RabbitMQ)
- **Mensageria**: [RabbitMQ 3.13](https://www.rabbitmq.com/) via `@nestjs/microservices` e `amqplib`
- **Persistência**: [PostgreSQL 16](https://www.postgresql.org/) via Docker Compose e [Prisma ORM 6](https://www.prisma.io/)
- **Linguagem**: TypeScript 5.7+ (Strict Mode)
- **Segurança & Criptografia**: AES-256-GCM (PCI-DSS), RBAC granular, timingSafeEqual, sanitização anti-XSS
- **Documentação Interativa**: Swagger UI (`/docs`) e OpenAPI JSON (`/docs-json`) com proteção Basic Auth / desativação em produção
- **Testes**: Jest (100% de cobertura nos use cases, controllers, consumers e guardas) e Supertest para E2E

---

## ⚡ Fluxo de Execução Assíncrono (HTTP 202 Accepted)

Todos os endpoints de escrita operam de forma não-bloqueante:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Backend Consumidor
    participant Controller as HTTP Controller (Port 5006)
    participant DB as PostgreSQL 16 (Port 5436)
    participant Broker as RabbitMQ (Queue 5676)
    participant Worker as Background Consumer
    participant Asaas as Gateway Asaas v3

    Client->>Controller: POST /payments/pix (Payload)
    Controller->>DB: Persiste registro inicial (status = RECEIVED)
    Controller->>Broker: Publica evento na fila (ex: payment.create_pix)
    Controller-->>Client: HTTP 202 Accepted (Tracking DTO imediato em < 30ms)

    Note over Worker,Broker: Processamento Assíncrono Desacoplado
    Broker->>Worker: Consome evento com confirmação manual (noAck: false)
    Worker->>Asaas: Chama API v3 (Criação de Cobrança e QR Code)
    Worker->>DB: Atualiza entidade (status = PENDING/CONFIRMED, QR Code, asaasId)
    Worker->>Broker: Enfileira 'webhook.forward_to_client'
    Worker->>Broker: channel.ack(msg)
```

### Contrato Padrão de Rastreamento (HTTP 202 Accepted)
```json
{
  "trackingId": "b1b7029b-98b7-4f6c-8463-b8c73229b011",
  "status": "RECEIVED",
  "message": "Cobrança PIX recebida e enfileirada para processamento.",
  "createdAt": "2026-09-10T15:30:00.000Z",
  "checkStatusUrl": "/payments/b1b7029b-98b7-4f6c-8463-b8c73229b011"
}
```

---

## 🚀 Como Executar

### 1. Ambiente de Desenvolvimento Local

O desenvolvimento local provisiona o PostgreSQL na porta `5436` e o RabbitMQ na porta `5676` (AMQP) e `15672` (Management Dashboard), evitando conflitos com outras portas padrão:

```bash
# 1. Copie as variáveis de ambiente de desenvolvimento
cp .env.dev.example .env

# 2. Instale as dependências
npm install

# 3. Inicie os containers de banco e mensageria
docker compose -f docker-compose.dev.yml up -d

# 4. Execute as migrations do banco de dados (Proibido db push)
npx prisma migrate dev

# 5. Inicie a aplicação NestJS em modo de desenvolvimento
npm run dev
```

Acesse:
- **API HTTP**: http://localhost:5006
- **Documentação Swagger UI**: http://localhost:5006/docs
- **Dashboard RabbitMQ Management**: http://localhost:15672 (usuário: `guest`, senha: `guest`)

---

### 2. Ambiente de Produção com Docker Compose

Para subir a stack completa em produção com isolamento de rede:

```bash
# 1. Configure as variáveis de ambiente de produção
cp .env.prod.example .env
# Edite o arquivo .env preenchendo credenciais e segredos fortes

# 2. Inicie a stack de produção
docker compose -f docker-compose.prod.yml up -d --build
```

> **Hardening de Produção**:
> - As portas do banco de dados (5432) e do RabbitMQ (5672 e 15672) **não são expostas no host**, comunicando-se estritamente pela rede bridge interna `asaas_network`.
> - Falha obrigatória na inicialização se as senhas de produção (`POSTGRES_PASSWORD` e `RABBITMQ_DEFAULT_PASS`) não forem fornecidas.
> - O `API_KEY` deve conter no mínimo 32 caracteres e rejeita segredos default conhecidos.

---

## ⚙️ Variáveis de Ambiente

| Variável | Padrão Local | Descrição |
| :--- | :--- | :--- |
| `PORT` | `5006` | Porta HTTP da aplicação |
| `NODE_ENV` | `development` | Ambiente de execução (`development` / `production` / `test`) |
| `API_KEY` | `local_api_key_secret_123` | Chave Master/Admin (`x-api-key`) — acesso total |
| `API_KEY_READ` | *(opcional)* | Chave com escopo restrito a consultas (`read`). Mutações e deleções retornam HTTP 403 |
| `API_KEY_PAYMENTS` | *(opcional)* | Chave com escopo restrito a transações de cobrança (`payments`, `read`) |
| `CARD_ENCRYPTION_KEY` | *(opcional)* | Chave de 256 bits para criptografia de envelope AES-256-GCM em trânsito no RabbitMQ |
| `SWAGGER_ENABLED` | `false` | Se `true` em produção, permite carregar o Swagger mesmo sem credenciais |
| `SWAGGER_USER` | *(opcional)* | Usuário para proteção do Swagger com HTTP Basic Auth em produção |
| `SWAGGER_PASSWORD` | *(opcional)* | Senha para proteção do Swagger com HTTP Basic Auth em produção |
| `ASAAS_API_KEY` | `$aact_...` | Chave de API da conta Asaas v3 |
| `ASAAS_ENVIRONMENT` | `sandbox` | `sandbox` (`https://api-sandbox.asaas.com`) ou `production` (`https://api.asaas.com`) |
| `ASAAS_WEBHOOK_SECRET`| `token_configurado_no_asaas` | Segredo para validar cabeçalho `asaas-access-token` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5436/asaas_db?schema=public` | URL de conexão com o PostgreSQL 16 |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5676` | URL de conexão AMQP com o RabbitMQ |
| `RABBITMQ_MAIN_QUEUE` | `asaas_main_queue` | Fila principal de mensageria |
| `RABBITMQ_DLQ_QUEUE` | `asaas_dlq_queue` | Fila de Dead Letter para mensagens com erro |
| `CLIENT_WEBHOOK_URL` | `http://localhost:3001/api/webhooks/asaas` | URL de repasse reverso para o backend consumidor |
| `CLIENT_WEBHOOK_SECRET` | `segredo_para_assinar_o_repasse` | Assinatura enviada no cabeçalho `x-webhook-secret` |

---

## 🔐 Segurança & Defesa em Profundidade

O microsserviço adota práticas rigorosas de segurança financeira:

1. **Controle de Acesso Granular (RBAC M2M)**:
   - Toda rota é protegida por `ApiKeyGuard` com escopos declarativos (`@RequireScopes`).
   - Chaves com escopo `read` (ex: `API_KEY_READ`) têm permissão exclusiva para rotas `GET`. Qualquer tentativa de emissão de cobrança (`POST`), alteração de cartão (`PUT`) ou cancelamento (`DELETE`) é sumariamente bloqueada com **HTTP 403 Forbidden**.
   - As comparações de chaves utilizam tempo constante (`crypto.timingSafeEqual`) contra ataques de temporização (*Timing Attacks*).

2. **Conformidade PCI-DSS (Criptografia de Envelope em Trânsito)**:
   - **Recomendação**: Adoção prioritária de `creditCardToken` gerado via SDK client-side do Asaas.
   - **Fallback Seguro**: Quando dados brutos de cartão forem transmitidos, o controller aplica criptografia de envelope **AES-256-GCM** via `CardEncryptionService`. Os dados legíveis (`number` e `ccv`) são anulados antes de despachar a mensagem ao RabbitMQ, transitando no broker exclusivamente como `encryptedCreditCard` (`iv:authTag:ciphertext`).

3. **Proteção de Documentação em Produção**:
   - Em ambiente `production`, `/docs` e `/docs-json` são **desativados por padrão** (HTTP 404), eliminando a exposição de superfície de ataque para scanners externos.
   - Opcionalmente, podem ser protegidos via **HTTP Basic Auth** (`SWAGGER_USER` e `SWAGGER_PASSWORD`).

4. **Sanitização Preventiva contra Stored XSS**:
   - Todos os DTOs de entrada utilizam o decorator `@IsSafeText()` nos campos de texto livre (`name`, `description`, `externalReference`).
   - Payloads com tags `<script>`, `<img>`, manipuladores de eventos (`onload=`) ou caracteres `<` e `>` são rejeitados com **HTTP 400 Bad Request**.

---

## 📋 Exemplos de Requisições cURL

### 1. Criar ou Sincronizar Cliente (`POST /customers`)
```bash
curl -X POST http://localhost:5006/customers \
  -H "Content-Type: application/json" \
  -H "x-api-key: local_api_key_secret_123" \
  -d '{
    "externalId": "user_uuid_1024",
    "name": "Carlos Silva",
    "email": "carlos.silva@exemplo.com.br",
    "cpfCnpj": "24971563792",
    "phone": "11988887777"
  }'
```
*Resposta: `HTTP 202 Accepted` com `trackingId` e `checkStatusUrl: /customers/user_uuid_1024`.*

---

### 2. Consultar Cliente por ExternalId (`GET /customers/:externalId`)
```bash
curl -X GET http://localhost:5006/customers/user_uuid_1024 \
  -H "x-api-key: local_api_key_secret_123"
```
*Resposta: `HTTP 200 OK` com dados do cliente e `status: SYNCED` ou `RECEIVED`.*

---

### 3. Criar Cobrança PIX com Split (`POST /payments/pix`)
```bash
curl -X POST http://localhost:5006/payments/pix \
  -H "Content-Type: application/json" \
  -H "x-api-key: local_api_key_secret_123" \
  -d '{
    "customerId": "user_uuid_1024",
    "value": 150.00,
    "dueDate": "2026-09-20",
    "description": "Pedido #1024 - Curso Online",
    "externalReference": "order_1024",
    "split": [
      {
        "walletId": "bbf67496-1379-4b6d-a348-fd5fa229f1c",
        "fixedValue": 30.00,
        "description": "Comissão Afiliado"
      }
    ]
  }'
```
*Resposta: `HTTP 202 Accepted` com `trackingId: b1b7029b...` e `checkStatusUrl: /payments/b1b7029b...`.*

---

### 4. Consultar Cobrança PIX e Obter QR Code (`GET /payments/:id`)
```bash
curl -X GET http://localhost:5006/payments/b1b7029b-98b7-4f6c-8463-b8c73229b011 \
  -H "x-api-key: local_api_key_secret_123"
```
*Resposta: `HTTP 200 OK` com `pixQrCodeBase64`, `pixPayload` (Copia-e-Cola) e `status: PENDING`.*

---

### 5. Cobrança de Cartão de Crédito (`POST /payments/credit-card`)
```bash
curl -X POST http://localhost:5006/payments/credit-card \
  -H "Content-Type: application/json" \
  -H "x-api-key: local_api_key_secret_123" \
  -d '{
    "customerId": "user_uuid_1024",
    "value": 300.00,
    "remoteIp": "187.12.34.56",
    "installmentCount": 1,
    "creditCard": {
      "holderName": "CARLOS SILVA",
      "number": "4111111111111111",
      "expiryMonth": "12",
      "expiryYear": "2028",
      "ccv": "123"
    },
    "creditCardHolderInfo": {
      "name": "Carlos Silva",
      "email": "carlos.silva@exemplo.com.br",
      "cpfCnpj": "24971563792",
      "postalCode": "01310-000",
      "addressNumber": "150",
      "phone": "11988887777"
    }
  }'
```
*Resposta: `HTTP 202 Accepted`.*

---

### 6. Criar Assinatura Recorrente (`POST /subscriptions`)
```bash
curl -X POST http://localhost:5006/subscriptions \
  -H "Content-Type: application/json" \
  -H "x-api-key: local_api_key_secret_123" \
  -d '{
    "customerId": "user_uuid_1024",
    "value": 59.90,
    "cycle": "MONTHLY",
    "nextDueDate": "2026-10-10",
    "description": "Plano Premium Mensal",
    "remoteIp": "187.12.34.56",
    "creditCardToken": "3673f47e-7517-4852-a548-5221081a9fd2"
  }'
```
*Resposta: `HTTP 202 Accepted`.*

---

### 7. Recepção Ultra-Rápida de Webhooks Asaas (`POST /webhooks/asaas`)
```bash
curl -X POST http://localhost:5006/webhooks/asaas \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: token_configurado_no_asaas" \
  -d '{
    "id": "evt_080225913252a",
    "event": "PAYMENT_RECEIVED",
    "dateCreated": "2026-09-10 14:35:00",
    "payment": {
      "id": "pay_080225913252",
      "status": "RECEIVED",
      "value": 150.00,
      "netValue": 148.01,
      "paymentDate": "2026-09-10"
    }
  }'
```
*Resposta: `HTTP 200 OK` em menos de 10ms.*

---

## 🧪 Testes Automatizados & Qualidade de Código

```bash
# Executar validação e padronização de código com ESLint
npm run lint

# Executar todos os testes unitários
npm test

# Executar testes unitários com relatório de cobertura
npm run test:cov

# Executar testes de ponta a ponta (E2E)
npm run test:e2e
```

---

## 📚 Documentações Técnicas dos Módulos (`spec.md`)

Cada módulo do sistema possui documentação técnica dedicada e formalizada:
- [src/infra/security/spec.md](file:///c:/Users/victo/dev/asaas_api/src/infra/security/spec.md) — Segurança, RBAC M2M, Criptografia PCI-DSS e Decisões de Arquitetura.
- [src/infra/messaging/spec.md](file:///c:/Users/victo/dev/asaas_api/src/infra/messaging/spec.md) — Infraestrutura RabbitMQ e Porta `IEventPublisher`.
- [src/infra/asaas/spec.md](file:///c:/Users/victo/dev/asaas_api/src/infra/asaas/spec.md) — Provedor HTTP do gateway Asaas v3 e exceções estruturadas.
- [src/modules/customer/spec.md](file:///c:/Users/victo/dev/asaas_api/src/modules/customer/spec.md) — Módulo de Clientes e evento `customer.sync`.
- [src/modules/payment/spec.md](file:///c:/Users/victo/dev/asaas_api/src/modules/payment/spec.md) — Módulo de Cobranças PIX, Cartão de Crédito e Split.
- [src/modules/subscription/spec.md](file:///c:/Users/victo/dev/asaas_api/src/modules/subscription/spec.md) — Ciclo de vida de assinaturas e recorrência.
- [src/modules/webhook/spec.md](file:///c:/Users/victo/dev/asaas_api/src/modules/webhook/spec.md) — Ingestão de webhooks <10ms, idempotência e repasse.

---

## 🛡️ Regra Estrita de Banco de Dados

> **É expressamente proibido o uso do comando `prisma db push` neste projeto.**  
> Todas as alterações de schema devem ser versionadas em migrations no diretório `prisma/migrations/`:
> - `npx prisma migrate dev --name <nome_da_alteracao>` (Ambiente de desenvolvimento)
> - `npx prisma migrate deploy` (Produção / Docker / CI)
