# Guia Mestre de Execução Sequencial — Story Points (Asaas API)

Bem-vindo ao repositório de instruções para a implementação modular do **Microsserviço de Abstração Asaas v3**.

Esta pasta contém os arquivos de especificação detalhados para cada etapa (Story Point) do projeto, organizados em uma sequência estrita de execução. Cada arquivo foi desenhado para ser executado de forma **autônoma** por um agente de IA ou desenvolvedor, com especificações baseadas na coleção oficial do Asaas ([Asaas Collection.postman_collection.json](file:///c:/Users/victo/dev/asaas_api/Asaas%20Collection.postman_collection.json)), no padrão arquitetural de **Monólito Modular Orientado a Eventos (EDA)** e com aplicação estrita dos princípios **SOLID**.

---

## 🎯 Arquitetura & Stack Tecnológica

- **Paradigma Arquitetural**: Monólito Modular 100% Orientado a Eventos (Event-Driven Architecture - EDA) com Bounded Contexts isolados e Clean Architecture (Ports & Adapters).
- **Framework**: NestJS 11 (Aplicação Híbrida: HTTP Express + Microservice RMQ)
- **Mensageria & Broker**: RabbitMQ 3.13+ via `@nestjs/microservices` e `amqplib`
- **Linguagem**: TypeScript 5.7+ (Strict Mode)
- **Persistência**: Prisma ORM 6 com **PostgreSQL 16 via Docker Compose**
- **Validação & Transformação**: `class-validator` + `class-transformer`
- **Cliente HTTP**: `fetch` nativo com tipagem estrita no provider `AsaasClientProvider`
- **Documentação**: `@nestjs/swagger`
- **Testes**: Jest (Unitários obrigatórios para todos os use cases, controllers e consumers)

---

## ⚡ Fluxo de Execução 100% Assíncrono (Event-Driven)

Esta API opera como um gateway financeiro intermediário entre backends consumidores e o gateway Asaas v3:

1. **Comando de Entrada (HTTP 202 Accepted)**:
   - Os endpoints de escrita (`POST`, `PUT`, `DELETE`) apenas validam os dados da requisição (DTO), persistem a intenção inicial no PostgreSQL com status `RECEIVED`, emitem o evento para a fila do RabbitMQ e retornam **imediatamente HTTP 202 Accepted** com o contrato de rastreamento:
     ```json
     {
       "trackingId": "pay_uuid_local_123",
       "status": "RECEIVED",
       "message": "Solicitação recebida com sucesso e enfileirada para processamento.",
       "createdAt": "2026-09-10T15:30:00.000Z",
       "checkStatusUrl": "/payments/pay_uuid_local_123"
     }
     ```
2. **Processamento Assíncrono no RabbitMQ (Worker Consumer)**:
   - Um consumer interno escuta a fila com confirmação manual (`noAck: false`).
   - Invoca a API do Asaas v3 via `AsaasClientProvider` de forma resiliente.
   - Atualiza o registro no PostgreSQL com os dados gerados (ex.: `asaasPaymentId`, QR Code PIX, status final).
   - Em caso de sucesso, efetua `channel.ack(msg)`. Em caso de falha transitória ou permanente, gerencia retentativas e Dead Letter Queue (`DLQ`).
3. **Notificação ao Backend Consumidor (Outbound Webhook & Polling)**:
   - Ao finalizar o processamento, a API despacha um webhook assinado para `CLIENT_WEBHOOK_URL` notificando a conclusão.
   - Alternativamente, o backend consumidor pode realizar consultas síncronas de leitura (`GET /payments/:id`, `GET /customers/:externalId`) diretamente no banco local.

---

## 🐳 Arquitetura Docker Compose (Dev & Prod)

O projeto possui **dois arquivos dedicados de Docker Compose**:

1. **`docker-compose.dev.yml` (Desenvolvimento Local)**:
   - **PostgreSQL 16 Alpine**: Porta host `5436:5432` com volume persistente `postgres_dev_data`.
   - **RabbitMQ 3.13 Management Alpine**: Porta AMQP host `5676:5672` e Dashboard Management `15672:15672` com volume persistente `rabbitmq_dev_data`.
   - Permite rodar a aplicação diretamente no host via `npm run dev` conectando-se ao banco em `localhost:5436` e ao RabbitMQ em `localhost:5676`.
   - Inicialização: `docker compose -f docker-compose.dev.yml up -d`.

2. **`docker-compose.prod.yml` (Produção Completa)**:
   - Sobe a stack completa na rede bridge interna (`asaas_network`).
   - Serviço de banco `postgres` (porta interna 5432 / host 5436) com `healthcheck` via `pg_isready`.
   - Serviço de mensageria `rabbitmq` (porta interna 5672 / host 5676, management 15672) com `healthcheck` via `rabbitmq-diagnostics -q ping`.
   - Serviço da API `asaas-api` na porta `5006:5006` construído via `Dockerfile` multi-stage, com `depends_on` condicionado à saúde do banco e do RabbitMQ.
   - Inicialização: `docker compose -f docker-compose.prod.yml up -d --build`.

---

## 🛡️ REGRA DE OURO OBRIGATÓRIA: Testes Unitários para TODOS os Componentes

> [!IMPORTANT]
> **Nenhuma tarefa ou caso de uso é considerado concluído sem seu respectivo teste unitário (`.spec.ts`) passando 100%**.
>
> 1. **Controllers**: Validar recebimento da requisição, gravação do registro inicial, publicação do evento via `IEventPublisher` e retorno imediato de `202 Accepted` (sem chamadas síncronas ao Asaas).
> 2. **Consumers/Workers**: Validar recepção de mensagens, deserialização de payload, chamada ao UseCase, confirmação manual (`ack`) no canal e tratamento de erros (`nack`/requeue).
> 3. **UseCases**: Validar regras de negócio e integrações mockando dependências externas (`PrismaService`, `AsaasClientProvider`, `IEventPublisher`).
> 4. **Isolamento de Infraestrutura**: RabbitMQ, Prisma e HTTP Asaas devem ser sempre mockados com Jest.

---

## 🗄️ REGRA ESTRITA DE BANCO DE DADOS: Proibição de `db push` e Obrigatoriedade de Migrations

> [!CAUTION]
> **É expressamente proibido o uso do comando `prisma db push` neste projeto.**
>
> Toda e qualquer criação ou alteração de tabelas e campos no schema do Prisma (`prisma/schema.prisma`) deve obrigatoriamente ser versionada e executada através de **migrations**:
> - **Ambiente de Desenvolvimento Local**:
>   ```bash
>   npx prisma migrate dev --name <nome_da_alteracao>
>   ```
> - **Ambiente de Produção / Docker / CI**:
>   ```bash
>   npx prisma migrate deploy
>   ```
> - **Regeneração de Tipos do Prisma Client**:
>   ```bash
>   npx prisma generate
>   ```
> O diretório `prisma/migrations/` deve ser comitado e mantido íntegro no controle de versão.

---

## 📝 REGRA DE OURO OBRIGATÓRIA: Arquivo `spec.md` em Cada Módulo

> [!IMPORTANT]
> **Todo e qualquer módulo do sistema (`src/modules/*` e submódulos estruturais de `src/infra/*`) deve OBRIGATORIAMENTE possuir seu próprio arquivo `spec.md` na raiz do seu diretório.**
>
> O arquivo `spec.md` funciona como a documentação técnica viva e contrato formal do módulo, devendo conter obrigatoriamente as seguintes seções:
>
> 1. **🎯 Visão Geral & Responsabilidade**: Bounded Context e propósito do módulo dentro do monólito modular.
> 2. **🔌 Interfaces & Portas (DIP)**: Contratos abstratos de repositório (`*RepositoryInterface`), mensageria e gateways.
> 3. **📑 Contratos de Entrada & Saída (DTOs)**: Schemas de entrada (validados com class-validator), retorno de leitura e DTOs de rastreamento 202 Accepted.
> 4. **⚡ Eventos RabbitMQ (EDA)**: Tópicos e padrões de eventos (`@EventPattern`) consumidos e emitidos pelo módulo, com schemas de payload.
> 5. **⚙️ Casos de Uso & Regras de Negócio**: Fluxos detalhados de orquestração entre controllers, consumers, use-cases e gateway Asaas.
> 6. **🛡️ Resiliência, Edge Cases & Falhas**: Políticas de retentativas, confirmação manual no RabbitMQ (`ack`/`nack`), status no banco e DLQ.
> 7. **🧪 Matriz de Testes Unitários**: Relação de suítes e cenários mínimos testados.

---

## 📑 Sequência de Execução dos Story Points

Os Story Points devem ser executados **estritamente na ordem numérica**, pois cada etapa consome os módulos, infraestrutura e eventos construídos na etapa anterior.

| SP | Arquivo de Instrução | Módulo / Escopo | Dependências |
| :---: | :--- | :--- | :---: |
| **00** | [SP-00-setup-infrastructure.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-00-setup-infrastructure.md) | Setup NestJS Híbrido (HTTP + RMQ), Prisma (Postgres 5436), RabbitMQ (5676/15672), MessagingModule (`IEventPublisher`), AsaasClientProvider & ApiKeyGuard | Nenhuma |
| **01** | [SP-01-customers.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-01-customers.md) | Módulo de Clientes (POST 202 Accepted, evento `customer.sync`, Consumer assíncrono com Asaas, GET síncrono) | SP-00 |
| **02** | [SP-02-pix-payments-split.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-02-pix-payments-split.md) | Cobranças PIX avulsas & Splits (POST 202 Accepted, evento `payment.create_pix`, Consumer gera cobrança e QR Code, GET polling) | SP-00, SP-01 |
| **03** | [SP-03-credit-card-payments.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-03-credit-card-payments.md) | Cartão de Crédito avulso/parcelado/tokenizado (POST 202 Accepted, evento `payment.charge_credit_card`, Consumer processa débito e token) | SP-00, SP-01, SP-02 |
| **04** | [SP-04-subscriptions-recurrence.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-04-subscriptions-recurrence.md) | Assinaturas Recorrentes (Criação, Troca de Cartão e Cancelamento via eventos assíncronos 202 Accepted) | SP-00, SP-01, SP-03 |
| **05** | [SP-05-webhooks-idempotency.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-05-webhooks-idempotency.md) | Ingestão Webhooks Asaas (200 imediato em <10ms -> RabbitMQ), Consumer de Idempotência e Outbound Webhook Forwarder com DLQ | SP-00 a SP-04 |
| **06** | [SP-06-swagger-docker-docs.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-06-swagger-docker-docs.md) | Swagger UI (com schemas 202 Accepted), Dockerfile, Docker Compose Prod (Postgres + RMQ + API Híbrida) & Testes E2E | SP-00 a SP-05 |
| **07** | [SP-07-subaccounts-split-escrow.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-07-subaccounts-split-escrow.md) | Subcontas, Split Inteligente (por `subaccountExternalId`) & Conta Escrow (Custódia/Garantia 202 Accepted) | SP-00 a SP-06 |

---

## ⚙️ Variáveis de Ambiente Globais

O arquivo `.env` deve conter a seguinte estrutura base:

```env
# Servidor HTTP
PORT=5006
NODE_ENV=development

# Autenticação interna da API (Backend consumidor -> Esta API)
API_KEY=sua_chave_secreta_aqui

# Integração Asaas v3
ASAAS_API_KEY=$aact_sua_chave_asaas_aqui
ASAAS_ENVIRONMENT=sandbox # ou production
ASAAS_WEBHOOK_SECRET=token_configurado_no_webhook_asaas

# Banco de Dados (PostgreSQL via Docker Compose)
DATABASE_URL="postgresql://postgres:postgres@localhost:5436/asaas_db?schema=public"

# Mensageria RabbitMQ (Docker Compose porta 5676 no host)
RABBITMQ_URL="amqp://guest:guest@localhost:5676"
RABBITMQ_MAIN_QUEUE="asaas_main_queue"
RABBITMQ_DLQ_QUEUE="asaas_dlq_queue"

# Webhook Forwarder (Notificação reversa para o Backend Consumidor)
CLIENT_WEBHOOK_URL=http://localhost:3001/api/webhooks/asaas
CLIENT_WEBHOOK_SECRET=segredo_para_assinar_o_repasse
```

---

## 🚦 Critérios de Validação em Cada Etapa

Antes de marcar qualquer Story Point como concluído e prosseguir para o próximo:

1. **Testes Unitários**:
   ```bash
   npm run test -- --passWithNoTests
   ```
   *Todos os testes de controllers, use cases e consumers devem passar com 100% de sucesso.*

2. **Compilação TypeScript**:
   ```bash
   npm run build
   ```
   *Nenhum erro de tipagem ou compilação permitido.*

3. **Validação de Lint**:
   ```bash
   npm run lint
   ```
   *Código limpo e padronizado.*
