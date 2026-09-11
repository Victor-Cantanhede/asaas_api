# Provedor HTTP do Gateway Asaas (AsaasClientModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `AsaasClientModule` é o módulo de infraestrutura que encapsula a comunicação HTTP com a API REST v3 do gateway Asaas. Ele abstrai endpoints, cabeçalhos de autenticação (`access_token`), alternância dinâmica entre ambientes (Sandbox vs. Produção), serialização e tratamento robusto de erros e exceções customizadas.

## 2. 🔌 Interfaces & Portas (DIP)
- **Provedor**: `AsaasClientProvider` (`src/infra/asaas/asaas-client.provider.ts`)
  - `getBaseUrl(): string`: Retorna a URL base ativa.
  - `get<T>(path: string, params?: Record<string, any>): Promise<T>`: Executa GET com serialização de querystrings.
  - `post<T>(path: string, body?: any): Promise<T>`: Executa POST com payload JSON.
  - `put<T>(path: string, body?: any): Promise<T>`: Executa PUT para atualizações cadastrais.
  - `delete<T>(path: string): Promise<T>`: Executa DELETE para cancelamentos (ex: assinaturas).

## 3. 📑 Contratos de Entrada & Saída
- **Cabeçalhos Enviados**:
  - `access_token`: Chave de API Asaas (`ASAAS_API_KEY`)
  - `Content-Type`: `application/json`
  - `Accept`: `application/json`
- **Exceções Estruturadas**:
  - `AsaasBadRequestException` (HTTP 400): Extrai array `errors` retornado pelo Asaas com código e descrição de inconsistência.
  - `AsaasUnauthorizedException` (HTTP 401/403): Notifica credenciais inválidas ou token expirado.
  - `AsaasGatewayException` (HTTP 5xx / Falha de Rede): Erros 500, 502, 504 ou timeout na conexão.
  - `AsaasApiException`: Exceção base contendo status e array bruto de erros.

## 4. ⚡ Eventos RabbitMQ (EDA)
O `AsaasClientProvider` é consumido primordialmente pelos **Workers / Consumers** do RabbitMQ (`CustomerConsumer`, `PaymentPixConsumer`, `PaymentCreditCardConsumer`, `SubscriptionConsumer`). As requisições HTTP síncronas ao Asaas **nunca** bloqueiam o ciclo de vida dos controllers HTTP da aplicação, que retornam `202 Accepted` de forma instantânea.

## 5. ⚙️ Casos de Uso & Regras de Negócio
- **Resolução de Ambiente**:
  - `ASAAS_ENVIRONMENT=sandbox`: `https://api-sandbox.asaas.com`
  - `ASAAS_ENVIRONMENT=production`: `https://api.asaas.com`
- **Operações Principais Mapeadas**:
  - Clientes: `POST /v3/customers`, `GET /v3/customers`
  - Cobranças: `POST /v3/payments`, `GET /v3/payments/:id/pixQrCode`
  - Assinaturas: `POST /v3/subscriptions`, `PUT /v3/subscriptions/:id/creditCard`, `DELETE /v3/subscriptions/:id`

## 6. 🛡️ Resiliência, Edge Cases & Falhas
- **Parsing Seguro**: Tratamento defensivo de respostas que não retornam JSON válido.
- **Isolamento de Falha**: Em caso de falha transitória (timeout de rede ou 502 do Asaas), os consumers podem requebrar com retry; em falhas definitivas (400 cartão recusado), o erro é registrado no status `FAILED` da entidade local sem travar a fila.

## 7. 🧪 Matriz de Testes Unitários
- **Suíte**: `src/infra/asaas/tests/asaas-client.provider.spec.ts`
  - [x] Alternância correta de URL base entre Sandbox e Production.
  - [x] Injeção obrigatória do cabeçalho `access_token` e `Content-Type`.
  - [x] Serialização correta de query parameters em chamadas GET.
  - [x] Lançamento de `AsaasBadRequestException` quando status HTTP for 400 com lista de erros.
  - [x] Lançamento de `AsaasUnauthorizedException` quando status HTTP for 401.
  - [x] Lançamento de `AsaasGatewayException` quando status HTTP for 500 ou ocorrer falha de rede.
