# SP-06: Documentação Swagger, Containerização Docker & Finalização

- **Sprint**: 6
- **Status**: Concluído
- **Dependências**: [SP-00-setup-infrastructure.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-00-setup-infrastructure.md) a [SP-05-webhooks-idempotency.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-05-webhooks-idempotency.md)
- **Objetivo**: Configurar a documentação interativa Swagger em `/docs` evidenciando o padrão de resposta assíncrona `HTTP 202 Accepted`, criar o empacotamento com `Dockerfile` multi-stage e os **dois arquivos de Docker Compose (`docker-compose.dev.yml` e `docker-compose.prod.yml` com PostgreSQL 5436 e RabbitMQ 5676/15672)**, elaborar o `README.md` raiz com exemplos cURL assíncronos e implementar a suíte de testes E2E.

---

## 📂 Arquivos a Criar e Modificar

```
asaas_api/
├── Dockerfile
├── docker-compose.dev.yml                  # PostgreSQL (5436) + RabbitMQ (5676/15672) para dev local
├── docker-compose.prod.yml                 # Stack completa (API 5006 + PostgreSQL 5436 + RabbitMQ 5676/15672)
├── .dockerignore
├── README.md                               # Guia completo do projeto e contratos
├── src/
│   └── main.ts                             # Setup híbrido: Swagger, ValidationPipe e RMQ Microservice
└── test/
    ├── app.e2e-spec.ts                     # [TESTE E2E OBRIGATÓRIO]
    └── jest-e2e.json
```

---

## 📑 Especificações Técnicas

### 1. Configuração do Swagger (`src/main.ts`)

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const config = new DocumentBuilder()
    .setTitle('Asaas API — Gateway Financeiro Orientado a Eventos')
    .setDescription(
      'Microsserviço de abstração e gateway assíncrono para o Asaas v3. ' +
      'Opera com arquitetura de Monólito Modular Orientado a Eventos (RabbitMQ), ' +
      'respostas imediatas HTTP 202 Accepted em endpoints de escrita e repasse via Webhooks.'
    )
    .setVersion('1.0.0')
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'x-api-key',
    )
    .addTag('Clientes', 'Comandos assíncronos de gestão e sincronização de clientes')
    .addTag('Cobranças PIX', 'Emissão assíncrona de PIX e captura de QR Code via RabbitMQ')
    .addTag('Cartão de Crédito', 'Cobranças avulsas/parceladas e tokenização assíncrona')
    .addTag('Assinaturas', 'Ciclo de vida de assinaturas recorrentes com mensageria')
    .addTag('Webhooks', 'Recepção ultra-rápida (<10ms) e repasse tolerante a falhas')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Conexão do Microservice RabbitMQ
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5676')],
      queue: configService.get<string>('RABBITMQ_MAIN_QUEUE', 'asaas_main_queue'),
      queueOptions: { durable: true },
      noAck: false,
    },
  });

  await app.startAllMicroservices();

  const port = configService.get<number>('PORT', 5006);
  await app.listen(port);
  console.log(`🚀 Asaas API rodando na porta ${port}`);
  console.log(`📑 Swagger UI disponível em http://localhost:${port}/docs`);
}
bootstrap();
```

---

### 2. `Dockerfile` Multi-Stage Otimizado

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --production

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 5006

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

---

### 3. Docker Compose de Produção (`docker-compose.prod.yml`)

Stack completa com PostgreSQL (porta host 5436), RabbitMQ (porta host 5676 e management 15672) e API (porta host 5006):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: asaas_postgres_prod
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres_prod_secret}
      POSTGRES_DB: ${POSTGRES_DB:-asaas_db}
    ports:
      - "5436:5432"
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-asaas_db}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - asaas_network

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: asaas_rabbitmq_prod
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER:-guest}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS:-guest}
    ports:
      - "5676:5672"   # AMQP
      - "15672:15672" # Management UI
    volumes:
      - rabbitmq_prod_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - asaas_network

  asaas-api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: asaas_api_prod
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "${PORT:-5006}:5006"
    environment:
      - PORT=5006
      - NODE_ENV=production
      - API_KEY=${API_KEY}
      - ASAAS_API_KEY=${ASAAS_API_KEY}
      - ASAAS_ENVIRONMENT=${ASAAS_ENVIRONMENT:-production}
      - ASAAS_WEBHOOK_SECRET=${ASAAS_WEBHOOK_SECRET}
      - DATABASE_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres_prod_secret}@postgres:5432/${POSTGRES_DB:-asaas_db}?schema=public
      - RABBITMQ_URL=amqp://${RABBITMQ_DEFAULT_USER:-guest}:${RABBITMQ_DEFAULT_PASS:-guest}@rabbitmq:5672
      - RABBITMQ_MAIN_QUEUE=asaas_main_queue
      - RABBITMQ_DLQ_QUEUE=asaas_dlq_queue
      - CLIENT_WEBHOOK_URL=${CLIENT_WEBHOOK_URL}
      - CLIENT_WEBHOOK_SECRET=${CLIENT_WEBHOOK_SECRET}
    networks:
      - asaas_network

networks:
  asaas_network:
    driver: bridge

volumes:
  postgres_prod_data:
  rabbitmq_prod_data:
```

---

### 4. `README.md` Completo da Raiz

O arquivo `README.md` raiz deve documentar:
- Visão geral da arquitetura de Monólito Modular 100% Orientado a Eventos.
- Guia de execução rápida (dev e prod).
- Tabela de variáveis de ambiente.
- Exemplos de requisições cURL para os contratos `HTTP 202 Accepted`:
  1. `POST /customers` -> `202 Accepted`
  2. `POST /payments/pix` -> `202 Accepted`
  3. `GET /payments/:id` -> `200 OK` (com QR Code PIX)
  4. `POST /payments/credit-card` -> `202 Accepted`
  5. `POST /subscriptions` -> `202 Accepted`
  6. `POST /webhooks/asaas` -> `200 OK` (< 10ms)

---

## 🧪 TESTES E2E OBRIGATÓRIOS

### `test/app.e2e-spec.ts`

- [ ] **Acesso à Documentação Swagger**: Retorna 200 em `GET /docs` e `GET /docs-json`.
- [ ] **Segurança Global**: Bloqueia requisições sem `x-api-key` com 401 Unauthorized.
- [ ] **Resposta Assíncrona 202**: Valida que um comando válido responde com status 202 e formato `AsyncCommandTrackingDto`.

---

## 🤖 Prompt de Execução Autônoma

```markdown
Execute as tarefas do SP-06:
1. Configure o Swagger UI no main.ts refletindo os contratos 202 Accepted.
2. Crie o Dockerfile multi-stage com compilação e prisma migrate deploy.
3. Crie o docker-compose.dev.yml com PostgreSQL (5436) e RabbitMQ (5676/15672).
4. Crie o docker-compose.prod.yml com PostgreSQL (5436), RabbitMQ (5676/15672) e asaas-api (5006).
5. Crie .dockerignore.
6. Escreva o README.md na raiz do repositório com instruções completas e exemplos cURL.
7. Valide que todos os módulos possuem seu respectivo spec.md criado e consistente (src/infra/messaging/spec.md, src/infra/asaas/spec.md, src/modules/customer/spec.md, src/modules/payment/spec.md, src/modules/subscription/spec.md e src/modules/webhook/spec.md).
8. Implemente o teste E2E em test/app.e2e-spec.ts.
9. Valide executando: npm test, npm run test:e2e e npm run build.
```

---

## 🚦 Critérios de Aceite

1. `GET http://localhost:5006/docs` exibe a interface do Swagger com tags e schemas assíncronos.
2. 100% dos módulos do sistema possuem seus arquivos `spec.md` devidamente preenchidos e atualizados.
3. `npm run test:e2e` passa com sucesso.
4. `docker-compose.dev.yml` e `docker-compose.prod.yml` funcionam com Postgres na 5436 e RabbitMQ na 5676.
5. `npm run build` compila sem erros.
