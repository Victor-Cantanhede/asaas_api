# Módulo de Webhooks (WebhookModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `WebhookModule` gerencia a recepção ultra-rápida (< 10ms) de webhooks do Asaas, execução de idempotência estrita através de chave única de evento (`eventId`), atualização de status das entidades locais (`Payment` e `Subscription`) e repasse assinado via HTTP para o backend consumidor (`CLIENT_WEBHOOK_URL`).

---

## 2. 🔌 Interfaces & Portas (DIP)
- **Repositório**: `IWebhookEventRepository` (`src/modules/webhook/repositories/webhook-event.repository.interface.ts`)
  - `findByEventId(eventId: string): Promise<WebhookEvent | null>`
  - `create(data: CreateWebhookEventData): Promise<WebhookEvent>`
  - `markProcessed(id: string): Promise<WebhookEvent>`
  - `updateForwardStatus(id: string, forwardStatus: string, forwardError?: string | null): Promise<WebhookEvent>`
  - Token de injeção: `WEBHOOK_EVENT_REPOSITORY_TOKEN`
- **Implementação**: `PrismaWebhookEventRepository` (`src/modules/webhook/repositories/prisma-webhook-event.repository.ts`)
- **Mensageria**: Emissão via `IEventPublisher` (`EVENT_PUBLISHER_TOKEN`)

---

## 3. 📑 Contratos de Entrada & Saída (DTOs)
- **Entrada (Recepção Asaas)**: `POST /webhooks/asaas`
  - Cabeçalho Obrigatório: `asaas-access-token: <ASAAS_WEBHOOK_SECRET>`
  - DTO: `AsaasWebhookPayloadDto` (`id`, `event`, `dateCreated?`, `account?`, `payment?`, `subscription?`, `transfer?`, `anticipation?`, `invoice?`)
  - Resposta: `HTTP 200 OK` (`WebhookResponseDto`)
    ```json
    {
      "received": true,
      "message": "Webhook recebido com sucesso e enfileirado para processamento assíncrono."
    }
    ```
- **Saída (Repasse ao Consumidor)**: `POST ${CLIENT_WEBHOOK_URL}`
  - Cabeçalho de Assinatura: `x-webhook-secret: <CLIENT_WEBHOOK_SECRET>`
  - Payload: Objeto completo do evento enviado pelo Asaas.

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **`webhook.received`**:
  - Publicado pelo `WebhookController` após validar o cabeçalho de autenticação.
  - Consumido por `WebhookConsumer`.
- **`webhook.forward_to_client`**:
  - Publicado pelo `WebhookConsumer` após auditoria e validação de não-duplicidade.
  - Consumido por `WebhookForwarderConsumer`.

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **`ProcessAsaasWebhookUseCase`**:
  1. Extrai `eventId = payload.id` (ou fallback seguro).
  2. Verifica se `eventId` já existe em `webhook_events`.
  3. Se já existir, descarta de forma idempotente sem alterar status ou reenviar ao cliente.
  4. Se inédito, persiste o evento bruto e atualiza a entidade correspondente (`Payment` ou `Subscription`).
  5. Se o pagamento ou assinatura não for localizado localmente (ex: criado fora da API ou após reset de banco), registra um `WARN` informativo e prossegue com o repasse ao consumidor sem quebrar a esteira.
  6. Marca evento como `processed = true`.
- **`WebhookForwarderConsumer`**:
  1. Lê `CLIENT_WEBHOOK_URL` e `CLIENT_WEBHOOK_SECRET`.
  2. Dispara requisição HTTP POST para o backend consumidor com cabeçalho `x-webhook-secret`.
  3. Se o consumidor responder com erro (4xx/5xx), extrai o corpo da resposta para diagnóstico.
  4. Atualiza `forwardStatus` para `FORWARDED` ou `FAILED` com descrição do erro.

---

## 6. 🛡️ Peculiaridades Arquiteturais, Resiliência & Edge Cases

### 6.1. Peculiaridade do Asaas v3: Campos Dinâmicos e Nó `account`
No Asaas v3, especialmente quando recursos de **Subcontas** ou **Splits de Pagamento** estão ativados, os payloads de webhook incluem metadados contextuais adicionais na raiz do JSON:
- `account`: `{ id: string, ownerId: string | null }` (identificador da subconta/carteira geradora).
- `split`: detalhes das divisões realizadas.
- `transfer`, `anticipation`, `invoice`: objetos específicos enviados conforme o tipo de evento.

### 6.2. Peculiaridade do NestJS: Encadeamento de Pipes Globais vs `forbidNonWhitelisted`
A API utiliza globalmente `forbidNonWhitelisted: true` para proteção contra *Over-Posting* e *Mass Assignment*.  
Contudo, no NestJS:
- **Pipes Globais rodam em cadeia antes dos pipes de rota/controller**. O uso de `@UsePipes(new ValidationPipe({ whitelist: false }))` na rota **não sobrepõe** o pipe global.
- Quando o Asaas envia campos como `account`, o pipe global gerava rejeição imediata com `HTTP 400 Bad Request: ["property account should not exist"]`.
- **Penalização pelo Asaas**: Quando uma URL de webhook responde repetidamente com status `400` ou `500`, o gateway Asaas marca a URL com **"Penalização aplicada"** e desativa o envio temporariamente.
- **Solução Arquitetural (`GlobalAppValidationPipe`)**:  
  Em [src/main.ts](../../main.ts), foi introduzida a classe `GlobalAppValidationPipe` que herda de `ValidationPipe`. Ao validar instâncias de `AsaasWebhookPayloadDto`, ela desativa dinamicamente `whitelist: false` e `forbidNonWhitelisted: false`, mantendo a validação estrita em todas as demais rotas da aplicação sem quebrar webhooks com novos campos do gateway.

### 6.3. Idempotência e Geração de Fallback do `eventId`
- O Asaas envia identificadores únicos de evento como `evt_d26e303b...&20598710`.
- Para payloads legados ou omissos, o sistema aplica fallback determinístico:
  `evt_${payload.payment?.id || payload.subscription?.id || 'gen'}_${payload.event}_${Date.now()}`
- Duplicatas são descartadas sem mutações no banco (`isDuplicate: true`) e sem disparo de repasse reverso.

### 6.4. Segurança e Tempo Constante (`timingSafeEqual`)
- O `AsaasWebhookAuthGuard` extrai `asaas-access-token` e compara com `ASAAS_WEBHOOK_SECRET` em memória através de `crypto.timingSafeEqual` sobre buffers de bytes.
- Se a variável `ASAAS_WEBHOOK_SECRET` não estiver configurada no servidor, o guard lança `UnauthorizedException` e emite log `ERROR` explícito.

---

## 7. 📊 Matriz de Observabilidade e Logs Estruturados

O ciclo de vida do webhook possui instrumentação de logging em todas as camadas:

| Camada / Arquivo | Nível | Mensagem / Gatilho |
|---|---|---|
| `AsaasWebhookAuthGuard` | `WARN` | Cabeçalho `asaas-access-token` ausente na requisição |
| `AsaasWebhookAuthGuard` | `ERROR` | Variável `ASAAS_WEBHOOK_SECRET` não configurada no servidor |
| `AsaasWebhookAuthGuard` | `WARN` | Token fornecido difere do segredo configurado (mismatch) |
| `WebhookController` | `LOG` | Notificação HTTP recebida do Asaas com resumo (`evento`, `id`, `paymentId`) |
| `WebhookController` | `LOG` | Evento enfileirado no RabbitMQ com sucesso (`webhook.received`) |
| `WebhookConsumer` | `LOG` | Início do consumo assíncrono da fila `asaas_main_queue` |
| `WebhookConsumer` | `WARN` | Evento duplicado detectado (descarte idempotente) |
| `WebhookConsumer` | `LOG` | Publicação de `webhook.forward_to_client` para o backend consumidor |
| `ProcessAsaasWebhookUseCase` | `LOG` | Registro bruto criado na tabela de auditoria `webhook_events` |
| `ProcessAsaasWebhookUseCase` | `LOG` | Pagamento/Assinatura local atualizado com novos dados |
| `ProcessAsaasWebhookUseCase` | `WARN` | Cobrança ou Assinatura recebida no webhook não localizada no banco local |
| `ProcessAsaasWebhookUseCase` | `LOG` | `WebhookEvent` marcado como processado com sucesso |
| `WebhookForwarderConsumer` | `LOG` | Início do disparo HTTP POST para `CLIENT_WEBHOOK_URL` |
| `WebhookForwarderConsumer` | `LOG` | Repasse concluído com sucesso (`HTTP 200`) |
| `WebhookForwarderConsumer` | `WARN` | Falha no repasse com status HTTP e corpo da resposta do cliente |

---

## 8. 🧪 Matriz de Testes Unitários
- `tests/asaas-webhook-auth.guard.spec.ts`: Comparação segura em memória e rejeição de tokens incorretos/ausentes.
- `tests/webhook.controller.spec.ts`: Retorno de HTTP 200 em < 10ms, publicação em `webhook.received` e suporte a payloads com nós `account` e `split`.
- `tests/webhook.consumer.spec.ts`: Idempotência estrita, descarte de duplicatas e emissão de `webhook.forward_to_client`.
- `tests/webhook-forwarder.consumer.spec.ts`: Repasse assinado com `x-webhook-secret` e tratamento de erros com/sem método `.text()`.
- `tests/process-asaas-webhook.use-case.spec.ts`: Atualização de pagamentos, assinaturas, custódia (escrow) e persistência em `WebhookEvent`.


