# Módulo de Mensageria (MessagingModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `MessagingModule` é o núcleo da camada de infraestrutura responsável por desacoplar produtores de comandos HTTP e consumidores de eventos assíncronos via **RabbitMQ 3.13**. Ele implementa o padrão **Ports & Adapters (Clean Architecture)** e **Dependency Inversion Principle (DIP)** do SOLID, provendo a abstração `IEventPublisher` para que nenhum controlador ou caso de uso dependa diretamente do `ClientProxy` do NestJS ou de detalhes de transporte do AMQP.

---

## 2. 🔌 Interfaces & Portas (DIP)
- **Porta**: `IEventPublisher` (`src/infra/messaging/contracts/event-publisher.interface.ts`)
  - Método: `publish<T = any>(pattern: string, data: T): Promise<void>`
  - Token de Injeção: `EVENT_PUBLISHER_TOKEN` (Symbol)
- **Adaptador**: `RmqEventPublisher` (`src/infra/messaging/rmq-event-publisher.ts`)
  - Implementa `IEventPublisher`
  - Injeta `ClientProxy` via token `RMQ_CLIENT_TOKEN` (`'RABBITMQ_CLIENT'`)
  - Utiliza `this.client.emit(pattern, data)` para envio assíncrono e não-bloqueante

---

## 3. 📑 Contratos de Entrada & Saída
- **Entrada no Publisher**:
  - `pattern: string`: Nome do evento no formato de tópicos (ex: `customer.sync`, `payment.create_pix`)
  - `data: T`: Objeto serializável contendo identificadores e metadados do comando
- **Retorno**: `Promise<void>` resolvido imediatamente após o enfileiramento

---

## 4. ⚡ Eventos RabbitMQ (EDA)
Tópicos emitidos pelo publisher gerenciados em `messaging.constants.ts`:
- `customer.sync`: Sincronização e criação de clientes no Asaas
- `payment.create_pix`: Geração assíncrona de cobrança PIX e QR Code
- `payment.charge_credit_card`: Processamento de cobrança via cartão de crédito / token (com envelope seguro)
- `subscription.create`: Criação e agendamento de assinatura recorrente (com envelope seguro)
- `subscription.update_card`: Atualização do cartão de crédito da assinatura (com envelope seguro)
- `subscription.cancel`: Cancelamento de assinatura recorrente
- `webhook.received`: Ingestão assíncrona de webhook vindo do gateway Asaas
- `webhook.forward_to_client`: Despacho do evento tratado para o backend consumidor

---

## 5. ⚙️ Casos de Uso & Regras de Negócio
- A aplicação opera como um processo híbrido: HTTP Express recebendo comandos e Microservice NestJS RMQ consumindo as filas.
- Filas configuradas com durabilidade (`durable: true`) para garantir persistência mesmo em reinicializações do broker.
- Confirmação manual obrigatória (`noAck: false`) em todos os consumidores da aplicação.

---

## 6. 🛡️ Resiliência, Edge Cases & Segurança (PCI-DSS & Hardening)
- **Proteção de Dados em Trânsito (PCI-DSS Requisitos 3 e 4)**:
  - Dados sensíveis de cartão (`number` e `ccv`) **nunca** são transmitidos em texto claro para as filas do RabbitMQ.
  - Quando dados brutos de cartão forem enviados, a aplicação utiliza envelope criptográfico **AES-256-GCM** (`CardEncryptionService`) e publica unicamente o campo `encryptedCreditCard` (`iv:authTag:ciphertext`).
  - Filas persistentes e eventuais Dead Letter Queues (DLQs) ficam imunes a dumps ou inspeções de tráfego.
- **Eliminação de Credenciais Hardcoded**: A conexão com o broker exige a variável `RABBITMQ_URL` explicitamente configurada no ambiente (sem fallbacks insecure em código).
- **Hardening de Rede em Produção**: As portas 5672 (AMQP) e 15672 (Dashboard Web) do RabbitMQ **não são expostas para o host** no `docker-compose.prod.yml`, limitando o tráfego estritamente à rede bridge interna `asaas_network`.
- **Falha de Conexão com RabbitMQ**: `amqp-connection-manager` mantém reconexão automática contínua.
- **Dead Letter Queue (DLQ)**: Mensagens com falhas irrecuperáveis ou após esgotamento de retentativas são encaminhadas para a fila de DLQ (`asaas_dlq_queue`).
- **Fail-Fast**: Caso o broker esteja offline durante a inicialização, o Microservice registra erro no log mantendo a integridade das políticas de reconexão.

---

## 7. 🧪 Matriz de Testes Unitários
- **Suíte**: `src/infra/messaging/tests/rmq-event-publisher.spec.ts`
  - [x] Emissão com sucesso chamando `client.emit` com o pattern e payload corretos.
  - [x] Propagação de erro tipado caso `client.emit` lance exceção.
