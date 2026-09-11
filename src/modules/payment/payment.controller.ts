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
  PAYMENT_REPOSITORY_TOKEN,
  IPaymentRepository,
} from './repositories/payment.repository.interface';
import {
  CUSTOMER_REPOSITORY_TOKEN,
  ICustomerRepository,
} from '../customer/repositories/customer.repository.interface';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../infra/messaging/messaging.constants';
import { CreatePixPaymentDto } from './dto/create-pix-payment.dto';
import { CreateCreditCardPaymentDto } from './dto/create-credit-card-payment.dto';
import { PaymentDetailsResponseDto } from './dto/payment-details-response.dto';
import { AsyncCommandTrackingDto } from '../../core/dto/async-command-tracking.dto';
import { GetPaymentUseCase } from './use-cases/get-payment.use-case';
import { CardEncryptionService } from '../../infra/security/card-encryption.service';
import { RequireScopes, ApiScope } from '../../infra/auth/scopes.decorator';

@ApiTags('Cobranças PIX')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('payments')
export class PaymentController {
  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(CUSTOMER_REPOSITORY_TOKEN)
    private readonly customerRepository: ICustomerRepository,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
    private readonly getPaymentUseCase: GetPaymentUseCase,
    @Optional()
    private readonly cardEncryptionService?: CardEncryptionService,
  ) {}

  @Post('pix')
  @RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para emissão de cobrança PIX com split opcional',
    description:
      'Garante a persistência da cobrança local com status RECEIVED, enfileira o evento "payment.create_pix" no RabbitMQ e retorna imediatamente HTTP 202 com URL de polling.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Cobrança PIX enfileirada com sucesso',
    type: AsyncCommandTrackingDto,
  })
  async createPixPayment(
    @Body() dto: CreatePixPaymentDto,
  ): Promise<AsyncCommandTrackingDto> {
    // Localiza cliente por ID primário ou por externalId
    let customer = await this.customerRepository.findById(dto.customerId);
    if (!customer) {
      customer = await this.customerRepository.findByExternalId(dto.customerId);
    }

    if (!customer) {
      throw new NotFoundException(
        `Cliente "${dto.customerId}" não encontrado no sistema. Cadastre-o previamente via POST /customers`,
      );
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const splitConfig = dto.split && dto.split.length > 0 ? JSON.stringify(dto.split) : null;

    const payment = await this.paymentRepository.createInitial({
      customerId: customer.id,
      billingType: 'PIX',
      value: dto.value,
      dueDate,
      externalReference: dto.externalReference,
      splitConfig,
    });

    await this.eventPublisher.publish(EVENT_PATTERNS.PAYMENT_CREATE_PIX, {
      paymentId: payment.id,
    });

    return {
      trackingId: payment.id,
      status: payment.status,
      message: 'Cobrança PIX recebida e enfileirada para processamento.',
      createdAt: payment.createdAt.toISOString(),
      checkStatusUrl: `/payments/${payment.id}`,
    };
  }

  @Post('credit-card')
  @RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para cobrança via Cartão de Crédito (avulso, parcelado ou token)',
    description:
      'Valida dados do cartão ou token, salva o registro com status RECEIVED, despacha evento "payment.charge_credit_card" para o RabbitMQ e retorna imediatamente HTTP 202.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Cobrança de cartão aceita e enfileirada para processamento',
    type: AsyncCommandTrackingDto,
  })
  async createCreditCardPayment(
    @Body() dto: CreateCreditCardPaymentDto,
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
        `Cliente "${dto.customerId}" não encontrado no sistema. Cadastre-o previamente via POST /customers`,
      );
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const splitConfig = dto.split && dto.split.length > 0 ? JSON.stringify(dto.split) : null;

    const payment = await this.paymentRepository.createInitial({
      customerId: customer.id,
      billingType: 'CREDIT_CARD',
      value: dto.value,
      dueDate,
      externalReference: dto.externalReference,
      splitConfig,
    });

    let encryptedCreditCard: string | undefined;
    let creditCardPayload = dto.creditCard;

    if (dto.creditCard && this.cardEncryptionService) {
      encryptedCreditCard = this.cardEncryptionService.encrypt(dto.creditCard);
      creditCardPayload = undefined;
    }

    await this.eventPublisher.publish(EVENT_PATTERNS.PAYMENT_CHARGE_CREDIT_CARD, {
      paymentId: payment.id,
      remoteIp: dto.remoteIp,
      installmentCount: dto.installmentCount,
      creditCard: creditCardPayload,
      encryptedCreditCard,
      creditCardHolderInfo: dto.creditCardHolderInfo,
      creditCardToken: dto.creditCardToken,
    });

    return {
      trackingId: payment.id,
      status: payment.status,
      message: 'Cobrança de cartão recebida e enfileirada para processamento.',
      createdAt: payment.createdAt.toISOString(),
      checkStatusUrl: `/payments/${payment.id}`,
    };
  }

  @Get(':id')
  @RequireScopes(ApiScope.READ)
  @ApiOperation({
    summary: 'Consulta síncrona local de cobrança (polling / detalhes)',
    description:
      'Retorna os detalhes completos da cobrança, incluindo status atualizado, identificadores Asaas e QR Code PIX quando disponível.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do pagamento na API local',
    example: 'b1b7029b-98b7-4f6c-8463-b8c73229b011',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cobrança encontrada no banco local',
    type: PaymentDetailsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Cobrança com o ID fornecido não encontrada',
  })
  async getPaymentById(
    @Param('id') id: string,
  ): Promise<PaymentDetailsResponseDto> {
    return this.getPaymentUseCase.execute(id);
  }
}
