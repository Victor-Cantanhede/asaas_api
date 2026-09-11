import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
  NotFoundException,
  BadRequestException,
  Optional,
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
  SUBSCRIPTION_REPOSITORY_TOKEN,
  ISubscriptionRepository,
} from './repositories/subscription.repository.interface';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from '../customer/repositories/customer.repository.interface';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../infra/messaging/messaging.constants';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionCardDto } from './dto/update-subscription-card.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { AsyncCommandTrackingDto } from '../../core/dto/async-command-tracking.dto';
import { GetSubscriptionUseCase } from './use-cases/get-subscription.use-case';
import { CardEncryptionService } from '../../infra/security/card-encryption.service';
import { RequireScopes, ApiScope } from '../../infra/auth/scopes.decorator';

@ApiTags('Assinaturas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('subscriptions')
export class SubscriptionController {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY_TOKEN)
    private readonly subscriptionRepository: ISubscriptionRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
    private readonly getSubscriptionUseCase: GetSubscriptionUseCase,
    @Optional()
    private readonly cardEncryptionService?: CardEncryptionService,
  ) {}

  @Post()
  @RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para criação de nova assinatura recorrente',
    description:
      'Garante registro inicial com status RECEIVED, enfileira "subscription.create" no RabbitMQ e retorna imediatamente HTTP 202 com URL de acompanhamento.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Assinatura aceita e enfileirada para processamento',
    type: AsyncCommandTrackingDto,
  })
  async createSubscription(
    @Body() dto: CreateSubscriptionDto,
  ): Promise<AsyncCommandTrackingDto> {
    if (!dto.creditCard && !dto.creditCardToken) {
      throw new BadRequestException(
        'É obrigatório informar os dados do cartão de crédito (creditCard) ou um token salvo (creditCardToken)',
      );
    }

    let customer = await this.customerRepository.findById(dto.customerId);
    if (!customer) {
      customer = await this.customerRepository.findByExternalId(dto.customerId);
    }

    if (!customer) {
      throw new NotFoundException(
        `Cliente "${dto.customerId}" não encontrado no sistema`,
      );
    }

    const nextDueDate = dto.nextDueDate ? new Date(dto.nextDueDate) : null;

    const subscription = await this.subscriptionRepository.createInitial({
      customerId: customer.id,
      cycle: dto.cycle,
      value: dto.value,
      nextDueDate,
      externalReference: dto.externalReference,
    });

    let encryptedCreditCard: string | undefined;
    let creditCardPayload = dto.creditCard;

    if (dto.creditCard && this.cardEncryptionService) {
      encryptedCreditCard = this.cardEncryptionService.encrypt(dto.creditCard);
      creditCardPayload = undefined;
    }

    await this.eventPublisher.publish(EVENT_PATTERNS.SUBSCRIPTION_CREATE, {
      subscriptionId: subscription.id,
      remoteIp: dto.remoteIp,
      creditCard: creditCardPayload,
      encryptedCreditCard,
      creditCardHolderInfo: dto.creditCardHolderInfo,
      creditCardToken: dto.creditCardToken,
    });

    return {
      trackingId: subscription.id,
      status: subscription.status,
      message: 'Criação de assinatura recebida e enfileirada para processamento.',
      createdAt: subscription.createdAt.toISOString(),
      checkStatusUrl: `/subscriptions/${subscription.id}`,
    };
  }

  @Put(':id/credit-card')
  @RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para atualização do cartão de crédito da assinatura',
    description:
      'Enfileira evento "subscription.update_card" para atualizar os dados no Asaas e na base local, retornando HTTP 202.',
  })
  @ApiParam({ name: 'id', description: 'UUID da assinatura no sistema local' })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Solicitação de alteração enfileirada',
    type: AsyncCommandTrackingDto,
  })
  async updateSubscriptionCard(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionCardDto,
  ): Promise<AsyncCommandTrackingDto> {
    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription) {
      throw new NotFoundException(`Assinatura "${id}" não encontrada`);
    }

    let encryptedCreditCard: string | undefined;
    let creditCardPayload = dto.creditCard;

    if (dto.creditCard && this.cardEncryptionService) {
      encryptedCreditCard = this.cardEncryptionService.encrypt(dto.creditCard);
      creditCardPayload = undefined;
    }

    await this.eventPublisher.publish(EVENT_PATTERNS.SUBSCRIPTION_UPDATE_CARD, {
      subscriptionId: subscription.id,
      remoteIp: dto.remoteIp,
      creditCard: creditCardPayload,
      encryptedCreditCard,
      creditCardHolderInfo: dto.creditCardHolderInfo,
      creditCardToken: dto.creditCardToken,
    });

    return {
      trackingId: subscription.id,
      status: subscription.status,
      message: 'Solicitação de atualização de cartão da assinatura enfileirada.',
      createdAt: new Date().toISOString(),
      checkStatusUrl: `/subscriptions/${subscription.id}`,
    };
  }

  @Delete(':id')
  @RequireScopes(ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para cancelamento de assinatura recorrente',
    description:
      'Enfileira evento "subscription.cancel" para efetuar o cancelamento junto ao Asaas e marcar a assinatura como INACTIVE.',
  })
  @ApiParam({ name: 'id', description: 'UUID da assinatura no sistema local' })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Solicitação de cancelamento enfileirada',
    type: AsyncCommandTrackingDto,
  })
  async cancelSubscription(
    @Param('id') id: string,
  ): Promise<AsyncCommandTrackingDto> {
    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription) {
      throw new NotFoundException(`Assinatura "${id}" não encontrada`);
    }

    await this.eventPublisher.publish(EVENT_PATTERNS.SUBSCRIPTION_CANCEL, {
      subscriptionId: subscription.id,
    });

    return {
      trackingId: subscription.id,
      status: subscription.status,
      message: 'Solicitação de cancelamento de assinatura enfileirada.',
      createdAt: new Date().toISOString(),
      checkStatusUrl: `/subscriptions/${subscription.id}`,
    };
  }

  @Get(':id')
  @RequireScopes(ApiScope.READ)
  @ApiOperation({
    summary: 'Consulta síncrona local de assinatura por ID',
    description:
      'Retorna os dados completos da assinatura no PostgreSQL local, incluindo status e dados tokenizados.',
  })
  @ApiParam({ name: 'id', description: 'UUID da assinatura no sistema local' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assinatura encontrada',
    type: SubscriptionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Assinatura não localizada',
  })
  async getSubscriptionById(
    @Param('id') id: string,
  ): Promise<SubscriptionResponseDto> {
    return this.getSubscriptionUseCase.execute(id);
  }
}
