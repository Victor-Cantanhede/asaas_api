# SP-00: Setup, Infraestrutura & Fundação Híbrida (HTTP + RabbitMQ)

- **Sprint**: 0
- **Status**: Concluído
- **Dependências**: Nenhuma
- **Objetivo**: Inicializar o projeto NestJS 11 em modo **Aplicação Híbrida (HTTP Express + Microservice RabbitMQ)**, configurar persistência com Prisma 6 e **PostgreSQL 16 (porta 5436)**, mensageria com **RabbitMQ 3.13 (portas 5676 AMQP e 15672 Management)** via Docker Compose (`docker-compose.dev.yml`), estruturar o módulo de mensageria com inversão de dependência (`IEventPublisher`), provedor HTTP resiliente do Asaas (`AsaasClientProvider`), autenticação por API Key (`ApiKeyGuard`) e pipeline de testes unitários Jest.

---

## 📂 Arquivos a Criar e Configurar

```
asaas_api/
├── .env.example
├── .env
├── docker-compose.dev.yml             # [PostgreSQL 5436 + RabbitMQ 5676/15672]
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── main.ts                        # [Bootstrap Híbrido: HTTP + connectMicroservice RMQ]
    ├── app.module.ts
    ├── core/
    │   └── contracts/
    │       └── event-payload.interface.ts
    └── infra/
        ├── config/
        │   ├── env.validation.ts
        │   └── asaas.config.ts
        ├── prisma/
        │   ├── prisma.service.ts
        │   └── prisma.module.ts
        ├── messaging/
        │   ├── spec.md                          # [DOCUMENTAÇÃO TÉCNICA OBRIGATÓRIA DO MÓDULO]
        │   ├── contracts/
        │   │   └── event-publisher.interface.ts # [DIP: Porta para emissão de eventos]
        │   ├── rmq-event-publisher.ts           # [Adaptador com ClientProxy do NestJS]
        │   ├── rmq-event-publisher.spec.ts      # [TESTE OBRIGATÓRIO]
        │   ├── messaging.constants.ts           # [Tokens de injeção e nomes de filas/eventos]
        │   └── messaging.module.ts              # [ClientsModule configurado com RMQ]
        ├── asaas/
        │   ├── spec.md                          # [DOCUMENTAÇÃO TÉCNICA OBRIGATÓRIA DO MÓDULO]
        │   ├── asaas-client.provider.ts
        │   ├── asaas-client.provider.spec.ts   # [TESTE OBRIGATÓRIO]
        │   ├── asaas-client.module.ts
        │   └── errors/
        │       ├── asaas-api.exception.ts
        │       ├── asaas-bad-request.exception.ts
        │       └── asaas-unauthorized.exception.ts
        └── auth/
            ├── api-key.guard.ts
            └── api-key.guard.spec.ts           # [TESTE OBRIGATÓRIO]
```

---

## 📑 Especificações Técnicas Detalhadas

### 1. Modelagem Prisma com Ciclo de Vida Assíncrono (`prisma/schema.prisma`)

As entidades devem acomodar o ciclo assíncrono (estados de `RECEIVED`, `PROCESSING`, `FAILED` com justificativa e dados finais gerados pelo Asaas):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Customer {
  id              String   @id @default(uuid())
  externalId      String   @unique @map("external_id")
  asaasCustomerId String?  @unique @map("asaas_customer_id")
  name            String
  email           String
  cpfCnpj         String?  @map("cpf_cnpj")
  phone           String?
  status          String   @default("RECEIVED") // RECEIVED | SYNCED | FAILED
  failureReason   String?  @map("failure_reason")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  payments      Payment[]
  subscriptions Subscription[]

  @@index([status])
  @@map("customers")
}

model Payment {
  id                    String    @id @default(uuid())
  customerId            String    @map("customer_id")
  asaasPaymentId        String?   @unique @map("asaas_payment_id")
  externalReference     String?   @map("external_reference")
  billingType           String    @map("billing_type") // PIX | CREDIT_CARD
  status                String    @default("RECEIVED") // RECEIVED | PROCESSING | PENDING | CONFIRMED | RECEIVED_IN_CASH | REFUNDED | FAILED
  value                 Float
  netValue              Float?    @map("net_value")
  dueDate               DateTime? @map("due_date")
  paymentDate           DateTime? @map("payment_date")
  invoiceUrl            String?   @map("invoice_url")
  pixQrCodeBase64       String?   @map("pix_qr_code_base64")
  pixPayload            String?   @map("pix_payload")
  pixExpirationDate     DateTime? @map("pix_expiration_date")
  splitConfig           String?   @map("split_config")
  failureReason         String?   @map("failure_reason")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([externalReference])
  @@map("payments")
}

model Subscription {
  id                  String    @id @default(uuid())
  customerId          String    @map("customer_id")
  asaasSubscriptionId String?   @unique @map("asaas_subscription_id")
  externalReference   String?   @map("external_reference")
  billingType         String    @default("CREDIT_CARD") @map("billing_type")
  status              String    @default("RECEIVED") // RECEIVED | PROCESSING | ACTIVE | INACTIVE | FAILED
  cycle               String    @default("MONTHLY")
  value               Float
  nextDueDate         DateTime? @map("next_due_date")
  creditCardToken     String?   @map("credit_card_token")
  creditCardBrand     String?   @map("credit_card_brand")
  creditCardLast4     String?   @map("credit_card_last4")
  failureReason       String?   @map("failure_reason")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([externalReference])
  @@map("subscriptions")
}

model WebhookEvent {
  id             String    @id @default(uuid())
  eventId        String    @unique @map("event_id")
  event          String
  asaasPaymentId String?   @map("asaas_payment_id")
  payload        String
  processed      Boolean   @default(false)
  forwardStatus  String?   @map("forward_status")
  forwardError   String?   @map("forward_error")
  processedAt    DateTime? @map("processed_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@index([event])
  @@index([asaasPaymentId])
  @@map("webhook_events")
}
```

---

### 2. Docker Compose de Desenvolvimento (`docker-compose.dev.yml`)

O ambiente de desenvolvimento local provisiona o PostgreSQL na porta `5436` e o RabbitMQ com Management UI na porta `5676` (AMQP) e `15672`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: asaas_postgres_dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: asaas_db
    ports:
      - "5436:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d asaas_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: asaas_rabbitmq_dev
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5676:5672"   # Porta AMQP mapeada no host
      - "15672:15672" # Dashboard Web de Gestão
    volumes:
      - rabbitmq_dev_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_dev_data:
  rabbitmq_dev_data:
```

**Configuração do `.env.example` e `.env`**:
```env
# Servidor HTTP
PORT=5006
NODE_ENV=development

# Autenticação interna
API_KEY=local_api_key_secret_123

# Asaas v3
ASAAS_API_KEY=$aact_sua_chave_asaas_aqui
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_SECRET=token_configurado_no_asaas

# Banco de Dados (Host conecta na porta 5436)
DATABASE_URL="postgresql://postgres:postgres@localhost:5436/asaas_db?schema=public"

# RabbitMQ (Host conecta na porta 5676)
RABBITMQ_URL="amqp://guest:guest@localhost:5676"
RABBITMQ_MAIN_QUEUE="asaas_main_queue"
RABBITMQ_DLQ_QUEUE="asaas_dlq_queue"

# Webhook Forwarder (Backend consumidor)
CLIENT_WEBHOOK_URL=http://localhost:3001/api/webhooks/asaas
CLIENT_WEBHOOK_SECRET=segredo_para_assinar_o_repasse
```

---

### 3. Bootstrap da Aplicação Híbrida (`src/main.ts`)

O NestJS deve ser inicializado escutando requisições HTTP e conectado ao RabbitMQ no mesmo processo:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Conexão do Microservice RabbitMQ para consumo assíncrono de eventos
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5676')],
      queue: configService.get<string>('RABBITMQ_MAIN_QUEUE', 'asaas_main_queue'),
      queueOptions: {
        durable: true,
      },
      noAck: false, // Confirmação manual obrigatória nos consumers
    },
  });

  await app.startAllMicroservices();

  const port = configService.get<number>('PORT', 5006);
  await app.listen(port);
}
bootstrap();
```

---

### 4. Módulo de Mensageria com SOLID (Inversão de Dependência)

#### A. Contrato `IEventPublisher` (`src/infra/messaging/contracts/event-publisher.interface.ts`):
```typescript
export interface IEventPublisher {
  publish<T = any>(pattern: string, data: T): Promise<void>;
}

export const EVENT_PUBLISHER_TOKEN = Symbol('IEventPublisher');
```

#### B. Implementação `RmqEventPublisher` (`src/infra/messaging/rmq-event-publisher.ts`):
```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { IEventPublisher } from './contracts/event-publisher.interface';
import { RMQ_CLIENT_TOKEN } from './messaging.constants';

@Injectable()
export class RmqEventPublisher implements IEventPublisher {
  constructor(
    @Inject(RMQ_CLIENT_TOKEN) private readonly client: ClientProxy,
  ) {}

  async publish<T = any>(pattern: string, data: T): Promise<void> {
    // client.emit envia evento assíncrono para a fila RabbitMQ
    this.client.emit(pattern, data);
  }
}
```

#### C. `MessagingModule` (`src/infra/messaging/messaging.module.ts`):
Configura o `ClientsModule.registerAsync` com as opções do RabbitMQ e provê o `EVENT_PUBLISHER_TOKEN` mapeado para `RmqEventPublisher`.

---

### 5. Provedor HTTP Asaas (`AsaasClientProvider`)

- **Base URL**:
  - `sandbox`: `https://api-sandbox.asaas.com`
  - `production`: `https://api.asaas.com`
- **Headers Padrão**: `access_token: <ASAAS_API_KEY>`, `Content-Type: application/json`.
- **Tratamento de Erros da API Asaas**:
  - HTTP 400: Deserializa array `errors` retornado pelo Asaas e lança `AsaasBadRequestException`.
  - HTTP 401: Lança `AsaasUnauthorizedException`.
  - HTTP 500/502/504 ou Timeout/Fetch Fail: Lança `AsaasGatewayException`.

---

### 6. Guard de Autenticação por API Key (`ApiKeyGuard`)

- Protege os endpoints HTTP da API.
- Valida o header `x-api-key` contra a variável de ambiente `API_KEY`.
- Se inválido ou ausente, lança `UnauthorizedException('Chave de API (x-api-key) inválida ou não informada')`.

---

## 🧪 TESTES UNITÁRIOS OBRIGATÓRIOS

### 1. `src/infra/messaging/rmq-event-publisher.spec.ts`
- [ ] **Publicação com Sucesso**: Deve chamar `client.emit` com o pattern correto e os dados do evento.
- [ ] **Resiliência a Erro no Broker**: Deve propagar erro tipado caso a emissão falhe.

### 2. `src/infra/asaas/asaas-client.provider.spec.ts`
- [ ] **Configuração de Ambiente**: Deve selecionar URL Sandbox vs. Production baseado em `ASAAS_ENVIRONMENT`.
- [ ] **Cabeçalho de Autenticação**: Deve injetar `access_token` em todas as requisições.
- [ ] **Serialização de Query e Body**: GET com query params e POST com JSON body.
- [ ] **Tratamento de Erros**: Captura de HTTP 400 (`errors[]`), 401 e 500/502/network failure.

### 3. `src/infra/auth/api-key.guard.spec.ts`
- [ ] **Acesso Permitido**: Header `x-api-key` válido.
- [ ] **Header Ausente**: Bloqueio com `UnauthorizedException`.
- [ ] **Header Inválido**: Bloqueio com `UnauthorizedException`.

---

## 🤖 Prompt de Execução Autônoma

```markdown
Execute as tarefas do SP-00:
1. Inicialize package.json com NestJS 11, Prisma 6, @nestjs/microservices, amqplib, @types/amqplib, class-validator, class-transformer, @nestjs/config, jest e ts-jest.
2. Crie tsconfig.json, tsconfig.build.json e nest-cli.json.
3. Crie docker-compose.dev.yml com PostgreSQL 16 na porta 5436 (5436:5432) e RabbitMQ 3.13-management-alpine nas portas 5676 (5676:5672) e 15672 (15672:15672), ambos com healthcheck.
4. Configure .env.example e .env com PORT=5006, DATABASE_URL na 5436 e RABBITMQ_URL na 5676.
5. Suba os containers de desenvolvimento: docker compose -f docker-compose.dev.yml up -d.
6. Crie prisma/schema.prisma com os modelos Customer, Payment, Subscription e WebhookEvent contendo os status assíncronos (RECEIVED, PROCESSING, etc.) e campos de falha (failureReason).
7. Execute: npx prisma migrate dev --name init (proibido prisma db push).
8. Implemente PrismaService, PrismaModule e o bootstrap da aplicação híbrida em src/main.ts conectando o microservice RabbitMQ.
9. Implemente MessagingModule com o contrato IEventPublisher e o adapter RmqEventPublisher.
10. Crie src/infra/messaging/spec.md documentando contratos, interfaces e conexões RabbitMQ.
11. Implemente AsaasClientProvider e ApiKeyGuard.
12. Crie src/infra/asaas/spec.md documentando client HTTP, autenticação, retentativas e tratamento de erros do Asaas.
13. Implemente 100% dos testes unitários obrigatórios para RmqEventPublisher, AsaasClientProvider e ApiKeyGuard.
14. Valide executando: npm test e npm run build.
```

---

## 🚦 Critérios de Aceite

1. `docker compose -f docker-compose.dev.yml up -d` inicializa o PostgreSQL 16 (porta 5436) e o RabbitMQ (porta AMQP 5676 e Management 15672) com status saudável (`healthy`).
2. `npx prisma migrate dev --name init` cria a migration inicial SQL no PostgreSQL com sucesso.
3. Os arquivos `src/infra/messaging/spec.md` e `src/infra/asaas/spec.md` estão criados e devidamente documentados.
4. `npm test` passa com 100% de sucesso nos testes de `RmqEventPublisher`, `AsaasClientProvider` e `ApiKeyGuard`.
5. `npm run build` compila a aplicação TypeScript sem nenhum erro.
