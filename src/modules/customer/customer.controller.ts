import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../infra/auth/api-key.guard';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from './repositories/customer.repository.interface';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../infra/messaging/messaging.constants';
import { CreateOrGetCustomerDto } from './dto/create-or-get-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { AsyncCommandTrackingDto } from '../../core/dto/async-command-tracking.dto';
import { GetCustomerByExternalIdUseCase } from './use-cases/get-customer-by-external-id.use-case';
import { RequireScopes, ApiScope } from '../../infra/auth/scopes.decorator';

@ApiTags('Clientes')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('customers')
export class CustomerController {
  constructor(
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
    private readonly getCustomerByExternalIdUseCase: GetCustomerByExternalIdUseCase,
  ) {}

  @Post()
  @RequireScopes(ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para criar ou sincronizar cliente Asaas',
    description:
      'Garante a persistência da intenção no banco local com status RECEIVED, enfileira o evento "customer.sync" no RabbitMQ e retorna imediatamente HTTP 202 com os dados de rastreamento.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Solicitação aceita e enfileirada para processamento no RabbitMQ',
    type: AsyncCommandTrackingDto,
  })
  async createOrGetCustomer(
    @Body() dto: CreateOrGetCustomerDto,
  ): Promise<AsyncCommandTrackingDto> {
    const customer = await this.customerRepository.upsertInitial(dto);

    await this.eventPublisher.publish(EVENT_PATTERNS.CUSTOMER_SYNC, {
      customerId: customer.id,
      externalId: customer.externalId,
    });

    return {
      trackingId: customer.id,
      status: customer.status,
      message: 'Solicitação de sincronização de cliente enfileirada com sucesso.',
      createdAt: customer.createdAt.toISOString(),
      checkStatusUrl: `/customers/${customer.externalId}`,
    };
  }

  @Get(':externalId')
  @RequireScopes(ApiScope.READ)
  @ApiOperation({
    summary: 'Consulta síncrona local de cliente por externalId',
    description:
      'Retorna o estado atual do cliente no banco PostgreSQL (usado para polling pelo backend consumidor).',
  })
  @ApiParam({
    name: 'externalId',
    description: 'ID de referência externa do cliente no backend consumidor',
    example: 'user_uuid_123',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dados do cliente encontrados no banco local',
    type: CustomerResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Cliente com externalId informado não localizado',
  })
  async getByExternalId(
    @Param('externalId') externalId: string,
  ): Promise<CustomerResponseDto> {
    return this.getCustomerByExternalIdUseCase.execute(externalId);
  }
}
