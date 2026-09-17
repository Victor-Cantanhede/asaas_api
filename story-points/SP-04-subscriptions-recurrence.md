# SP-04: Módulo de Assinaturas Assíncrono (Subscriptions)

- **Sprint**: 4
- **Status**: Concluído
- **Dependências**: [SP-00-setup-infrastructure.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-00-setup-infrastructure.md), [SP-01-customers.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-01-customers.md), [SP-03-credit-card-payments.md](file:///c:/Users/victo/dev/asaas_api/story-points/SP-03-credit-card-payments.md)
- **Objetivo**: Implementar o ciclo de vida completo de assinaturas recorrentes com Cartão de Crédito de forma 100% orientada a eventos via RabbitMQ. Todos os endpoints de comando (`POST`, `PUT`, `DELETE`) respondem de imediato `HTTP 202 Accepted` e enfileiram eventos de criação, alteração de cartão e cancelamento para consumo resiliente pelos workers.

---

## 📂 Arquivos a Criar e Modificar

```
asaas_api/
└── src/
    └── modules/
        └── subscription/
            ├── spec.md                               # [DOCUMENTAÇÃO TÉCNICA OBRIGATÓRIA DO MÓDULO]
            ├── subscription.module.ts
            ├── subscription.controller.ts            # [POST, PUT, DELETE -> 202 Accepted & GET /:id]
            ├── subscription.controller.spec.ts       # [TESTE OBRIGATÓRIO]
            ├── consumers/
            │   ├── subscription.consumer.ts          # [Criação, Atualização e Cancelamento RMQ]
            │   └── subscription.consumer.spec.ts     # [TESTE OBRIGATÓRIO]
            ├── dto/
            │   ├── create-subscription.dto.ts
            │   ├── update-subscription-card.dto.ts
            │   └── subscription-response.dto.ts
            ├── repositories/
            │   ├── subscription.repository.interface.ts
            │   └── prisma-subscription.repository.ts
            └── use-cases/
                ├── process-create-subscription.use-case.ts
                ├── process-create-subscription.use-case.spec.ts      # [TESTE OBRIGATÓRIO]
                ├── process-update-subscription-card.use-case.ts
                ├── process-update-subscription-card.use-case.spec.ts # [TESTE OBRIGATÓRIO]
                ├── process-cancel-subscription.use-case.ts
                ├── process-cancel-subscription.use-case.spec.ts      # [TESTE OBRIGATÓRIO]
                ├── get-subscription.use-case.ts
                └── get-subscription.use-case.spec.ts                 # [TESTE OBRIGATÓRIO]
```

---

## 📑 Mapeamento Asaas (Postman Collection)

### 1. Criar Nova Assinatura
- **Método**: `POST {{baseUrl}}/v3/subscriptions`
- **Request Body**:
  ```json
  {
    "customer": "cus_000005401844",
    "billingType": "CREDIT_CARD",
    "value": 59.90,
    "nextDueDate": "2026-10-10",
    "cycle": "MONTHLY",
    "description": "Assinatura Plano Pro",
    "externalReference": "sub_ref_1001",
    "remoteIp": "187.12.34.56",
    "creditCard": {
      "holderName": "JOHN DOE",
      "number": "4111111111111111",
      "expiryMonth": "12",
      "expiryYear": "2028",
      "ccv": "123"
    },
    "creditCardHolderInfo": {
      "name": "John Doe",
      "email": "john.doe@asaas.com.br",
      "cpfCnpj": "24971563792",
      "postalCode": "01310-000",
      "addressNumber": "150",
      "phone": "4738010919"
    }
  }
  ```

### 2. Atualizar Cartão da Assinatura
- **Método**: `PUT {{baseUrl}}/v3/subscriptions/:id/creditCard`

### 3. Cancelar Assinatura
- **Método**: `DELETE {{baseUrl}}/v3/subscriptions/:id`

---

## 🧩 Contratos da API Local

### 1. `POST /subscriptions` (Criação Assíncrona)
Valida a requisição, persiste o registro com status `RECEIVED`, emite o evento `subscription.create` no RabbitMQ e retorna imediatamente **HTTP 202 Accepted**.

**Request Body (`CreateSubscriptionDto`)**:
```typescript
export class CreateSubscriptionDto {
  @ApiProperty({ description: 'ID local do Customer ou externalId' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ description: 'Valor da recorrência em Reais', example: 59.90 })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiProperty({
    description: 'Ciclo de cobrança',
    enum: ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'],
    default: 'MONTHLY'
  })
  @IsEnum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'])
  cycle: string;

  @ApiPropertyOptional({ description: 'Data da primeira cobrança (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  nextDueDate?: string;

  @ApiPropertyOptional({ description: 'Descrição da assinatura' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Referência externa' })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiProperty({ description: 'IP do pagador (antifraude Asaas)' })
  @IsIP()
  remoteIp: string;

  @ApiPropertyOptional({ description: 'Dados do cartão de crédito', type: CreditCardDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardDto)
  creditCard?: CreditCardDto;

  @ApiPropertyOptional({ description: 'Token de cartão existente' })
  @IsOptional()
  @IsString()
  creditCardToken?: string;

  @ApiPropertyOptional({ description: 'Dados do titular', type: CreditCardHolderInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardHolderInfoDto)
  creditCardHolderInfo?: CreditCardHolderInfoDto;
}
```

**Response (HTTP 202 Accepted - `AsyncCommandTrackingDto`)**:
```json
{
  "trackingId": "sub_local_uuid_456",
  "status": "RECEIVED",
  "message": "Criação de assinatura recebida e enfileirada para processamento.",
  "createdAt": "2026-09-10T15:30:00.000Z",
  "checkStatusUrl": "/subscriptions/sub_local_uuid_456"
}
```

### 2. `PUT /subscriptions/:id/credit-card` (Atualização Assíncrona de Cartão)
Publica evento `subscription.update_card` no RabbitMQ e retorna **HTTP 202 Accepted**.

### 3. `DELETE /subscriptions/:id` (Cancelamento Assíncrono)
Publica evento `subscription.cancel` no RabbitMQ e retorna **HTTP 202 Accepted**.

### 4. `GET /subscriptions/:id` (Consulta Síncrona de Leitura)
Retorna os dados da assinatura do banco local com status atualizado (`RECEIVED`, `ACTIVE`, `INACTIVE` ou `FAILED`).

---

## ⚙️ Arquitetura Orientada a Eventos: `SubscriptionConsumer`

O `SubscriptionConsumer` centraliza a escuta dos eventos do ciclo de vida:
- `@EventPattern('subscription.create')`: invoca `ProcessCreateSubscriptionUseCase`.
- `@EventPattern('subscription.update_card')`: invoca `ProcessUpdateSubscriptionCardUseCase`.
- `@EventPattern('subscription.cancel')`: invoca `ProcessCancelSubscriptionUseCase`.

Para cada evento:
1. Executa a integração com o Asaas via `AsaasClientProvider`.
2. Atualiza a entidade local no PostgreSQL.
3. Despacha evento para notificação do backend cliente via outbound webhook.
4. Efetua `channel.ack(originalMsg)`.

---

## 🧪 TESTES UNITÁRIOS OBRIGATÓRIOS

### 1. `src/modules/subscription/subscription.controller.spec.ts`
- [ ] **POST /subscriptions**: Retorna 202 Accepted e publica `subscription.create`.
- [ ] **PUT /subscriptions/:id/credit-card**: Retorna 202 Accepted e publica `subscription.update_card`.
- [ ] **DELETE /subscriptions/:id**: Retorna 202 Accepted e publica `subscription.cancel`.

### 2. `src/modules/subscription/consumers/subscription.consumer.spec.ts`
- [ ] **Consumo dos Eventos**: Valida despacho correto para cada use case e confirmação manual (`ack`).

### 3. `src/modules/subscription/use-cases/process-create-subscription.use-case.spec.ts`
- [ ] **Criação com Sucesso**: Comunica com Asaas, salva `asaasSubscriptionId`, tokeniza cartão e altera status para `ACTIVE`.
- [ ] **Falha no Asaas**: Registra status `FAILED` com justificativa em `failureReason`.

### 4. `src/modules/subscription/use-cases/process-update-subscription-card.use-case.spec.ts`
- [ ] **Atualização com Sucesso**: Atualiza token e dados do cartão na entidade local.

### 5. `src/modules/subscription/use-cases/process-cancel-subscription.use-case.spec.ts`
- [ ] **Cancelamento com Sucesso**: Chama Asaas `DELETE` e atualiza status local para `INACTIVE`.

### 6. `src/modules/subscription/use-cases/get-subscription.use-case.spec.ts`
- [ ] **Busca Síncrona**: Retorna entidade local ou lança `NotFoundException`.

---

## 🤖 Prompt de Execução Autônoma

```markdown
Execute as tarefas do SP-04:
1. Crie os DTOs CreateSubscriptionDto, UpdateSubscriptionCardDto e SubscriptionResponseDto.
2. Crie a interface ISubscriptionRepository e a implementação PrismaSubscriptionRepository.
3. Crie SubscriptionController com rotas assíncronas (POST, PUT e DELETE retornando 202 Accepted) e rota síncrona GET /subscriptions/:id.
4. Crie SubscriptionConsumer escutando os padrões:
   - @EventPattern('subscription.create')
   - @EventPattern('subscription.update_card')
   - @EventPattern('subscription.cancel')
   com confirmação manual no RmqContext (channel.ack).
5. Implemente os UseCases de processamento:
   - ProcessCreateSubscriptionUseCase
   - ProcessUpdateSubscriptionCardUseCase
   - ProcessCancelSubscriptionUseCase
   - GetSubscriptionUseCase
6. Registre os componentes no SubscriptionModule.
7. Crie src/modules/subscription/spec.md documentando a especificação técnica do módulo de assinaturas (ciclo de vida, transições de status, EventPatterns, troca de cartão e cancelamento).
8. Implemente 100% dos testes unitários obrigatórios para todos os use cases, controller e consumer.
9. Valide executando: npm test -- src/modules/subscription e npm run build.
```

---

## 🚦 Critérios de Aceite

1. Endpoints de comando respondem em < 30ms com `202 Accepted`.
2. O `SubscriptionConsumer` processa criação, troca de cartão e cancelamento sem perdas.
3. O arquivo `src/modules/subscription/spec.md` está criado e completamente preenchido.
4. 100% dos testes unitários passam (`npm test -- src/modules/subscription`).
5. Build compila sem erros (`npm run build`).
