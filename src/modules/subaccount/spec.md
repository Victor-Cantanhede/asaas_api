# Especificação Técnica — Módulo de Subcontas & Escrow (`src/modules/subaccount`)

## 1. 🎯 Visão Geral & Responsabilidade
O módulo de **Subcontas & Escrow** é responsável pela gestão descentralizada de carteiras parceiras (prestadores de serviços, vendedores e parceiros de marketplace) e pela infraestrutura de custódia e retenção de pagamentos (Conta Escrow).

### Objetivos Principais:
- Provisionar subcontas no Asaas v3 de forma assíncrona, capturando o `walletId` para splits.
- Habilitar de forma transparente a retenção de recebíveis (Conta Escrow) na subconta do parceiro.
- Oferecer Developer Experience (DX) superior ao permitir que os desenvolvedores utilizem seus próprios identificadores de negócio (`externalId`).

---

## 2. 🔌 Interfaces & Portas (DIP)
- **`ISubaccountRepository` (`repositories/subaccount.repository.interface.ts`)**:
  - `upsertInitial(dto: CreateSubaccountDto): Promise<Subaccount>`
  - `findById(id: string): Promise<Subaccount | null>`
  - `findByExternalId(externalId: string): Promise<Subaccount | null>`
  - `findByWalletId(walletId: string): Promise<Subaccount | null>`
  - `updateSynced(id: string, data: ...): Promise<Subaccount>`
  - `updateStatus(id: string, status: string, failureReason?: string | null): Promise<Subaccount>`
- **Token de Injeção**: `SUBACCOUNT_REPOSITORY_TOKEN`
- **Adaptador Concreto**: `PrismaSubaccountRepository`

---

## 3. 📑 Contratos de Entrada & Saída (DTOs)
- **Entrada (`CreateSubaccountDto`)**:
  - `externalId`: ID único no backend cliente.
  - `name`: Nome ou Razão Social.
  - `email`: E-mail de contato.
  - `cpfCnpj`: Documento fiscal.
  - `phone`, `mobilePhone`, `incomeValue`, `address`, `province`, `postalCode`, `companyType`: Opcionais.
  - `escrow`: Objeto `{ enabled: boolean, daysToExpire?: number }`.
- **Entrada (`CreateSubaccountTransferDto`)**:
  - `value`: Valor numérico positivo em Reais.
  - `pixAddressKey`: Chave PIX destino (opcional se informado bankAccount).
  - `pixAddressKeyType`: Tipo da chave PIX (`CPF`, `CNPJ`, `EMAIL`, `PHONE`, `EVP`).
  - `bankAccount`: Objeto com `bankCode`, `agency`, `account`, `accountDigit`, `bankAccountType`, `cpfCnpj`, `name`.
  - `description`: Descrição opcional.
- **Saída de Comando**: `AsyncCommandTrackingDto` (HTTP 202 Accepted).
- **Saída de Leitura**: `SubaccountResponseDto` (HTTP 200 OK).

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **Eventos Consumidos**:
  - `@EventPattern('subaccount.create')`
    - Payload: `{ subaccountId: string, externalId: string }`
  - `@EventPattern('subaccount.transfer')`
    - Payload: `{ subaccountId: string, transferData: CreateSubaccountTransferDto }`
- **Eventos Emitidos**:
  - `webhook.forward_to_client` com `{ event: 'SUBACCOUNT_CREATED', subaccount: { id, externalId, walletId, escrowEnabled } }`
  - `webhook.forward_to_client` com `{ event: 'TRANSFER_CREATED', transfer: { id, subaccountId, externalId, value, status } }`

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
1. **`CreateSubaccountUseCase`**:
   - Localiza a subconta local.
   - Consulta Asaas por CPF/CNPJ para evitar duplicidade (`GET /v3/accounts?cpfCnpj=...`).
   - Se a conta já existir no Asaas, reutiliza `id` e `walletId`.
   - Se inexistente, formata o payload. Para CPFs de 11 dígitos, injeta `birthDate: '1990-01-01'` (obrigatório pelo Asaas v3 quando não informado).
   - Invoca `POST /v3/accounts` capturando `id`, `walletId` e a credencial `apiKey` da subconta.
   - Criptografa a `apiKey` com envelope **AES-256-GCM** via `CardEncryptionService` para armazenamento seguro em repouso no PostgreSQL.
   - Se `escrowEnabled === true`, invoca `POST /v3/accounts/{id}/escrow` configurando dias de retenção.
   - Atualiza `walletId`, `apiKey` cifrada e `status = 'SYNCED'` no banco local.
   - Emite notificação de conclusão para o webhook do cliente via `webhook.forward_to_client`.
2. **`ProcessSubaccountTransferUseCase`**:
   - Permite que a **conta mãe controle e autorize os saques de subcontas**, impedindo retiradas unilaterais.
   - Localiza a subconta polimorficamente por UUID local ou `externalId`.
   - Recupera e descriptografa a `apiKey` da subconta em memória.
   - Monta o payload de transferência para chave PIX ou TED bancária tradicional.
   - Dispara `POST /v3/transfers` no Asaas autenticado com a chave da subconta (`customApiKey`).
   - Emite notificação de conclusão para `webhook.forward_to_client` com evento `TRANSFER_CREATED`.
3. **`GetSubaccountByExternalIdUseCase`**:
   - Leitura síncrona por `externalId`. Lança `NotFoundException` se não localizado.

---

## 6. 🛡️ Peculiaridades, Resiliência & Edge Cases

### 6.1. Restrição de Unicidade de `asaasAccountId` (`@unique`)
- No schema do Prisma ([schema.prisma](../../../prisma/schema.prisma)), a coluna `asaas_account_id` é estritamente única.
- **Armadilha de Colisão de Documento**: Se forem criadas duas subcontas locais distintas (com `externalId`s diferentes) utilizando o mesmo CPF/CNPJ, ambas resolverão para a mesma conta no Asaas na busca por documento.
- Ao salvar a segunda subconta, o PostgreSQL disparará erro de violação de chave única (`Unique constraint failed on the fields: (asaas_account_id)`). Portanto, a aplicação consumidora deve garantir que cada subconta possua documento fiscal exclusivo.

### 6.2. Proteção de Credenciais de Subconta (PCI-DSS & Envelope AES-256-GCM)
- A chave de API retornada pelo Asaas na criação da subconta concede poderes plenos de movimentação financeira.
- O sistema proíbe armazenamento em texto puro: a chave é cifrada com AES-256-GCM via `CardEncryptionService` antes de ser salva na coluna `api_key` da tabela `subaccounts`.

### 6.3. Confirmação Manual no RabbitMQ
- Sucesso -> `channel.ack(originalMsg)`
- Erro 400 Asaas / Negócio -> Marca `FAILED` no banco e faz `ack` (evita loop de veneno)
- Erro 5xx / Conexão -> `channel.nack(originalMsg, false, true)` para retentativa

### 6.4. Observabilidade e Conciliação Assíncrona de Saques via Webhook
- O endpoint `POST /subaccounts/:id/transfers` e o caso de uso `ProcessSubaccountTransferUseCase` realizam a solicitação da transferência no Asaas (`POST /v3/transfers`).
- A compensação bancária externa (TED ou liquidação de PIX) ocorre de forma assíncrona pelo Sistema de Pagamentos Brasileiro (SPB).
- Para monitorar a liquidação definitiva ou eventual rejeição:
  - O desenvolvedor deve habilitar no painel Asaas as flags de webhook: **`TRANSFER_DONE`** e **`TRANSFER_FAILED`**.
  - O `ProcessAsaasWebhookUseCase` intercepta esses eventos e emite logs estruturados (`[TRANSFERÊNCIA CONCLUÍDA]` e `[TRANSFERÊNCIA FALHOU]`), registrando o motivo de recusa caso ocorra falha no banco de destino.

---

## 7. 🧪 Matriz de Testes Unitários
- `subaccount.controller.spec.ts`: POST /subaccounts (202 Accepted), GET /subaccounts/:id (200/404) e POST /subaccounts/:id/transfers (202 Accepted).
- `subaccount.consumer.spec.ts`: Consumo do evento `subaccount.create` com `ack`/`nack`.
- `subaccount-transfer.consumer.spec.ts`: Consumo do evento `subaccount.transfer` com `ack`/`nack`.
- `create-subaccount.use-case.spec.ts`: Fluxos com e sem escrow, reutilização por CPF e persistência de `apiKey` criptografada.
- `process-subaccount-transfer.use-case.spec.ts`: Transferência via PIX e TED com descriptografia de `apiKey`, tratamento polimórfico e erros.
- `get-subaccount-by-external-id.use-case.spec.ts`: Consulta síncrona e exceções.
