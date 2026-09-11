# Módulo de Webhooks (WebhookModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `WebhookModule` gerencia a recepção ultra-rápida (< 10ms) de webhooks do Asaas, execução de idempotência estrita através de chave única de evento (`eventId`), atualização de status das entidades locais (`Payment` e `Subscription`) e repasse assinado via HTTP para o backend consumidor (`CLIENT_WEBHOOK_URL`).

## 2. 🔌 Interfaces & Portas (DIP)
- **Repositório**: `IWebhookEventRepository` (`src/modules/webhook/repositories/webhook-event.repository.interface.ts`)
  - `findByEventId(eventId: string): Promise<WebhookEvent | null>`
  - `create(data: CreateWebhookEventData): Promise<WebhookEvent>`
  - `markProcessed(id: string): Promise<WebhookEvent>`
  - `updateForwardStatus(id: string, forwardStatus: string, forwardError?: string | null): Promise<WebhookEvent>`
  - Token de injeção: `WEBHOOK_EVENT_REPOSITORY_TOKEN`
- **Implementação**: `PrismaWebhookEventRepository` (`src/modules/webhook/repositories/prisma-webhook-event.repository.ts`)
- **Mensageria**: Emissão via `IEventPublisher` (`EVENT_PUBLISHER_TOKEN`)

## 3. 📑 Contratos de Entrada & Saída (DTOs)
- **Entrada (Recepção Asaas)**: `POST /webhooks/asaas`
  - Cabeçalho Obrigatório: `asaas-access-token: <ASAAS_WEBHOOK_SECRET>`
  - DTO: `AsaasWebhookPayloadDto` (`id`, `event`, `dateCreated?`, `payment?`, `subscription?`)
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

## 4. ⚡ Eventos RabbitMQ (EDA)
- **`webhook.received`**:
  - Publicado pelo `WebhookController` após validar o cabeçalho de autenticação.
  - Consumido por `WebhookConsumer`.
- **`webhook.forward_to_client`**:
  - Publicado pelo `WebhookConsumer` após auditoria e validação de não-duplicidade.
  - Consumido por `WebhookForwarderConsumer`.

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **`ProcessAsaasWebhookUseCase`**:
  1. Verifica se `eventId` já existe em `webhook_events`.
  2. Se já existir, descarta de forma idempotente sem alterar status.
  3. Se inédito, persiste o evento e atualiza a entidade correspondente (`Payment` ou `Subscription`).
  4. Marca evento como `processed = true`.
- **`WebhookForwarderConsumer`**:
  1. Lê `CLIENT_WEBHOOK_URL` e `CLIENT_WEBHOOK_SECRET`.
  2. Dispara requisição HTTP POST para o backend consumidor com cabeçalho `x-webhook-secret`.
  3. Atualiza `forwardStatus` para `FORWARDED` ou `FAILED` com descrição do erro.

## 6. 🛡️ Resiliência, Edge Cases & Falhas
- **Segurança de Temporização**: O `AsaasWebhookAuthGuard` utiliza `crypto.timingSafeEqual` para prevenir ataques de timing analysis.
- **Fail-Closed**: Se o cabeçalho `asaas-access-token` for ausente ou inválido, a requisição é rejeitada com `401 Unauthorized` antes de qualquer processamento ou banco.
- **Isolamento de Erro do Consumidor**: Falha no endpoint do backend consumidor não afeta o recebimento e processamento local das cobranças do Asaas.

## 7. 🧪 Matriz de Testes Unitários
- `tests/asaas-webhook-auth.guard.spec.ts`: Comparação segura em memória e rejeição de tokens incorretos.
- `tests/webhook.controller.spec.ts`: Retorno de HTTP 200 em < 10ms e publicação em `webhook.received`.
- `tests/webhook.consumer.spec.ts`: Idempotência estrita, descarte de duplicatas e emissão de `webhook.forward_to_client`.
- `tests/webhook-forwarder.consumer.spec.ts`: Repasse assinado com `x-webhook-secret` e registro de status.
- `tests/process-asaas-webhook.use-case.spec.ts`: Atualização de pagamentos, assinaturas e persistência em `WebhookEvent`.

