# Módulo de Segurança (SecurityModule) — Especificação Técnica

## 1. 🎯 Visão Geral & Responsabilidade
O `SecurityModule` centraliza os mecanismos de defesa em profundidade, autenticação, autorização granular e conformidade regulatória (PCI-DSS, OWASP) do microsserviço `asaas_api`.

### Decisão Arquitetural (ADR): Gateway Single-Tenant M2M
A `asaas_api` é concebida como um **microsserviço de infraestrutura privado (Sidecar/Gateway)**, consumido exclusivamente pelo backend principal da aplicação através de rede privada interna (M2M — Machine-to-Machine).
- **Fronteira de Confiança (Trust Boundary)**: A `asaas_api` não atende navegadores ou usuários finais diretamente.
- **Tenancy e IDOR**: O controle de inquilinos (Multitenancy), organizações, usuários finais e autorização de recursos (prevenção de IDOR) é responsabilidade exclusiva do **backend consumidor**.
- **Credencial Única Asaas**: Esta instância da API representa uma única conta jurídica junto ao Asaas v3 (`ASAAS_API_KEY`).

---

## 2. 🔌 Componentes & Estrutura
- **Módulo**: `SecurityModule` (`src/infra/security/security.module.ts`) — `@Global()`
- **Serviço Criptográfico**: `CardEncryptionService` (`src/infra/security/card-encryption.service.ts`)
- **Guarda de Autenticação & RBAC**: `ApiKeyGuard` (`src/infra/auth/api-key.guard.ts`)
- **Decorators de Escopo**: `RequireScopes`, `ApiScope` (`src/infra/auth/scopes.decorator.ts`)
- **Validação Anti-XSS**: `IsSafeText` (`src/infra/security/validators/is-safe-text.decorator.ts`)
- **Utilitários de Sanitização**: `sanitization.utils.ts` e `@SanitizeText()`

---

## 3. 🛡️ Funcionalidades de Segurança

### 3.1. Autenticação Robusta & Proteção contra Timing Attacks
- Toda requisição aos controllers de negócio requer o cabeçalho `x-api-key`.
- A validação compara os bytes em tempo constante utilizando `crypto.timingSafeEqual` sobre buffers, prevenindo inferência de chaves por análise de temporização.
- Em ambiente de produção (`NODE_ENV=production`), a inicialização da API falha caso `API_KEY` possua menos de 32 caracteres ou utilize segredos default conhecidos.

### 3.2. Controle de Acesso Granular (RBAC M2M)
Suporte nativo a chaves com escopos dedicados para observância do princípio do menor privilégio:
- **`ApiScope.ADMIN` (`admin`)**: Acesso total a todas as rotas e operações.
- **`ApiScope.PAYMENTS` (`payments`)**: Emissão de cobranças PIX, cartão de crédito e gestão de assinaturas.
- **`ApiScope.WRITE` (`write`)**: Operações de mutação (`POST`, `PUT`, `PATCH`).
- **`ApiScope.READ` (`read`)**: Acesso restrito a consultas (`GET`).

**Configuração de Chaves:**
- `API_KEY`: Chave master/admin (escopos: `admin`, `write`, `payments`, `read`).
- `API_KEY_READ`: Chave restrita a consultas (`read`). Chamadas de escrita ou deleção resultam em **HTTP 403 Forbidden**.
- `API_KEY_PAYMENTS`: Chave dedicada a pagamentos (`payments`, `read`).
- `API_KEYS_CONFIG`: Configuração JSON opcional para definição flexível de chaves adicionais.

### 3.3. Criptografia de Cartão em Trânsito (PCI-DSS Requisitos 3 e 4)
- **Tokenização Preferencial**: Incentivo à tokenização client-side através do `creditCardToken` (SDK Asaas), reduzindo o escopo PCI do backend.
- **Envelope Criptográfico AES-256-GCM**:
  - Quando dados brutos (`creditCard`) forem enviados, o controller gera um envelope criptografado contendo IV randômico de 12 bytes (NIST), tag de autenticação de 16 bytes e texto cifrado:
    `iv:authTag:ciphertext` (Base64).
  - O campo `creditCard` em texto claro é anulado (`undefined`) antes da publicação no RabbitMQ.
  - A fila `asaas_main_queue` e eventuais DLQs armazenam apenas `encryptedCreditCard`.
  - Os consumers (`PaymentCreditCardConsumer` e `SubscriptionConsumer`) descriptografam os dados em memória imediatamente antes de invocar o caso de uso.

### 3.4. Hardening do Swagger em Produção
- Em `NODE_ENV=production`, o Swagger UI (`/docs`) e o JSON de especificação OpenAPI (`/docs-json`) são **desabilitados por padrão**, retornando HTTP 404.
- Caso `SWAGGER_USER` e `SWAGGER_PASSWORD` sejam informados, o acesso é protegido por middleware **HTTP Basic Auth**, com validação em tempo constante.

### 3.5. Sanitização Preventiva contra Stored XSS
- Decorator `@IsSafeText()` aplicado nos DTOs para validar campos de texto livre (`name`, `description`, `externalReference`).
- Rejeita payloads contendo tags `<script>`, `<img>`, manipuladores de eventos (`onload=`, `onerror=`) ou caracteres `<` e `>` com **HTTP 400 Bad Request**.
- Utilitário `escapeHtml` para conversão de caracteres em entidades seguras (`&lt;`, `&gt;`, `&quot;`, `&#x27;`, `&amp;`).

---

## 4. 🧪 Matriz de Testes
- `src/infra/security/tests/card-encryption.service.spec.ts`: Criptografia, decriptografia, rejeição de envelopes adulterados e detecção de envelopes.
- `src/infra/auth/tests/api-key.guard.spec.ts`: Timing safe comparison, rejeição de chaves inválidas, bloqueio 403 de chaves `read-only` em escritas e deleções.
- `src/infra/config/tests/setup-swagger.spec.ts`: Desativação em produção vs autenticação Basic Auth vs ambiente dev.
- `src/infra/security/tests/sanitization-and-xss.spec.ts`: Validação de DTOs rejeitando scripts, escape de entidades e detecção de padrões perigosos.
- `src/infra/config/tests/env.validation.spec.ts`: Validação estrita de segredos na inicialização em produção.
