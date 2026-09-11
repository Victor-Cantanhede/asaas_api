import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/setup-swagger';
import { RMQ_CLIENT_TOKEN } from '../src/infra/messaging/messaging.constants';
import { EVENT_PUBLISHER_TOKEN } from '../src/infra/messaging/contracts/event-publisher.interface';
import { of } from 'rxjs';

describe('Asaas API (e2e)', () => {
  let app: INestApplication;
  const apiKey = 'local_api_key_secret_123';

  beforeAll(async () => {
    process.env.API_KEY_READ = 'read_only_test_key_123';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RMQ_CLIENT_TOKEN)
      .useValue({
        emit: jest.fn().mockReturnValue(of(true)),
        connect: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(EVENT_PUBLISHER_TOKEN)
      .useValue({
        publish: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    setupSwagger(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Documentação Swagger (/docs)', () => {
    it('GET /docs deve responder com HTTP 200 (HTML da documentação interativa)', () => {
      return request(app.getHttpServer())
        .get('/docs')
        .expect((res) => {
          // Swagger redirection or 200 HTML
          expect([200, 301, 302]).toContain(res.status);
        });
    });

    it('GET /docs-json deve responder com HTTP 200 e especificação OpenAPI válida', () => {
      return request(app.getHttpServer())
        .get('/docs-json')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('openapi');
          expect(res.body.info.title).toContain('Asaas API');
          expect(res.body.paths['/customers']).toBeDefined();
          expect(res.body.paths['/payments/pix']).toBeDefined();
          expect(res.body.paths['/payments/credit-card']).toBeDefined();
          expect(res.body.paths['/subscriptions']).toBeDefined();
          expect(res.body.paths['/webhooks/asaas']).toBeDefined();
        });
    });
  });

  describe('Segurança Global e RBAC (x-api-key)', () => {
    it('deve bloquear com 401 Unauthorized se x-api-key estiver ausente', () => {
      return request(app.getHttpServer())
        .post('/customers')
        .send({
          externalId: 'test_ext_unauth',
          name: 'Unauthorized User',
          email: 'unauth@example.com',
        })
        .expect(401);
    });

    it('deve bloquear com 401 Unauthorized se x-api-key for inválida', () => {
      return request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', 'wrong_token')
        .send({
          externalId: 'test_ext_unauth',
          name: 'Unauthorized User',
          email: 'unauth@example.com',
        })
        .expect(401);
    });

    it('deve bloquear com 403 Forbidden se chave de leitura (API_KEY_READ) tentar executar mutação POST /customers', () => {
      return request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', 'read_only_test_key_123')
        .send({
          externalId: 'test_ext_read',
          name: 'Read Key User',
          email: 'read@example.com',
        })
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toContain('Chave de API não possui permissão para esta operação');
        });
    });

    it('deve rejeitar com 400 Bad Request se payload contiver tags <script> (Stored XSS prevention)', () => {
      return request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', apiKey)
        .send({
          externalId: 'test_xss_user',
          name: '<script>alert("xss")</script>',
          email: 'xss@example.com',
        })
        .expect(400)
        .expect((res) => {
          expect(JSON.stringify(res.body.message)).toContain('tags HTML');
        });
    });
  });

  describe('Contrato Assíncrono (HTTP 202 Accepted)', () => {
    it('POST /customers deve responder com HTTP 202 Accepted e formato AsyncCommandTrackingDto', () => {
      const uniqueExternalId = `e2e_user_${Date.now()}`;

      return request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', apiKey)
        .send({
          externalId: uniqueExternalId,
          name: 'E2E Test User',
          email: `${uniqueExternalId}@test.com`,
          phone: '11988887777',
        })
        .expect(202)
        .expect((res) => {
          expect(res.body).toHaveProperty('trackingId');
          expect(res.body.status).toBe('RECEIVED');
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('createdAt');
          expect(res.body.checkStatusUrl).toBe(`/customers/${uniqueExternalId}`);
        });
    });
  });
});
