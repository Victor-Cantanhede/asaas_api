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
- **Saída de Comando**: `AsyncCommandTrackingDto` (HTTP 202 Accepted).
- **Saída de Leitura**: `SubaccountResponseDto` (HTTP 200 OK).

---

## 4. ⚡ Eventos RabbitMQ (EDA)
- **Evento Consumido**:
  - `@EventPattern('subaccount.create')`
  - Payload: `{ subaccountId: string, externalId: string }`
- **Evento Emitido**:
  - `webhook.forward_to_client` com `{ event: 'SUBACCOUNT_CREATED', subaccount: { id, externalId, walletId, escrowEnabled } }`

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
1. **`CreateSubaccountUseCase`**:
   - Localiza a subconta local.
   - Consulta Asaas por CPF/CNPJ para evitar duplicidade.
   - Invoca `POST /v3/accounts` caso inexistente.
   - Se `escrowEnabled === true`, invoca `POST /v3/accounts/{id}/escrow`.
   - Atualiza `walletId` e `status = 'SYNCED'` no banco local.
   - Emite notificação de conclusão para o webhook do cliente.
2. **`GetSubaccountByExternalIdUseCase`**:
   - Leitura síncrona por `externalId`. Lança `NotFoundException` se não localizado.

---

## 6. 🛡️ Resiliência, Edge Cases & Falhas
- **Confirmação Manual no RabbitMQ**:
  - Sucesso -> `channel.ack(originalMsg)`
  - Erro 400 Asaas -> Marca `FAILED` no banco e faz `ack` (evita loop de veneno)
  - Erro 5xx / Conexão -> `channel.nack(originalMsg, false, true)` para retentativa

---

## 7. 🧪 Matriz de Testes Unitários
- `subaccount.controller.spec.ts`: POST 202 com tracking e GET 200/404.
- `subaccount.consumer.spec.ts`: Despacho e confirmações manuais `ack`/`nack`.
- `create-subaccount.use-case.spec.ts`: Fluxos com e sem escrow, reutilização por CPF e tratamento de erros.
- `get-subaccount-by-external-id.use-case.spec.ts`: Consulta síncrona e exceções.
