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
  SUBACCOUNT_REPOSITORY_TOKEN,
  ISubaccountRepository,
} from './repositories/subaccount.repository.interface';
import {
  EVENT_PUBLISHER_TOKEN,
  IEventPublisher,
} from '../../infra/messaging/contracts/event-publisher.interface';
import { EVENT_PATTERNS } from '../../infra/messaging/messaging.constants';
import { CreateSubaccountDto } from './dto/create-subaccount.dto';
import { CreateSubaccountTransferDto } from './dto/create-subaccount-transfer.dto';
import { SubaccountResponseDto } from './dto/subaccount-response.dto';
import { AsyncCommandTrackingDto } from '../../core/dto/async-command-tracking.dto';
import { GetSubaccountByExternalIdUseCase } from './use-cases/get-subaccount-by-external-id.use-case';
import { RequireScopes, ApiScope } from '../../infra/auth/scopes.decorator';

@ApiTags('Subcontas & Escrow')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('subaccounts')
export class SubaccountController {
  constructor(
    @Inject(SUBACCOUNT_REPOSITORY_TOKEN)
    private readonly subaccountRepository: ISubaccountRepository,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
    private readonly getSubaccountByExternalIdUseCase: GetSubaccountByExternalIdUseCase,
  ) {}

  @Post()
  @RequireScopes(ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para provisionar subconta de parceiro e ativar Escrow opcional',
    description:
      'Garante registro inicial da subconta com status RECEIVED no PostgreSQL, enfileira o evento "subaccount.create" no RabbitMQ e responde imediatamente HTTP 202 com URL de rastreamento.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Solicitação de criação de subconta enfileirada com sucesso',
    type: AsyncCommandTrackingDto,
  })
  async createSubaccount(
    @Body() dto: CreateSubaccountDto,
  ): Promise<AsyncCommandTrackingDto> {
    const subaccount = await this.subaccountRepository.upsertInitial(dto);

    await this.eventPublisher.publish(EVENT_PATTERNS.SUBACCOUNT_CREATE, {
      subaccountId: subaccount.id,
      externalId: subaccount.externalId,
    });

    return {
      trackingId: subaccount.id,
      status: subaccount.status,
      message: 'Solicitação de criação de subconta enfileirada com sucesso.',
      createdAt: subaccount.createdAt.toISOString(),
      checkStatusUrl: `/subaccounts/${subaccount.externalId}`,
    };
  }

  @Get(':externalId')
  @RequireScopes(ApiScope.READ)
  @ApiOperation({
    summary: 'Consulta síncrona local de subconta por externalId',
    description:
      'Retorna os dados cadastrais da subconta, o walletId para split e status de ativação do Escrow (custódia).',
  })
  @ApiParam({
    name: 'externalId',
    description: 'ID de referência externa do prestador/parceiro',
    example: 'freelancer_usr_123',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subconta localizada',
    type: SubaccountResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subconta com o externalId informado não foi encontrada',
  })
  async getByExternalId(
    @Param('externalId') externalId: string,
  ): Promise<SubaccountResponseDto> {
    return this.getSubaccountByExternalIdUseCase.execute(externalId);
  }

  @Post(':id/transfers')
  @RequireScopes(ApiScope.PAYMENTS, ApiScope.WRITE, ApiScope.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Comando assíncrono para transferência / saque manual de subconta via conta mãe',
    description:
      'Garante que as subcontas não sacam sozinhas. A conta mãe orquestra e autoriza o saque de valores via chave PIX ou TED bancária, enfileira o evento "subaccount.transfer" no RabbitMQ e responde imediatamente HTTP 202 com URL de rastreamento. O parâmetro :id aceita tanto o UUID local quanto o externalId.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da subconta no banco local ou externalId do parceiro',
    example: 'freelancer_usr_123',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Comando de transferência/saque aceito e enfileirado com sucesso',
    type: AsyncCommandTrackingDto,
  })
  async transferSubaccount(
    @Param('id') id: string,
    @Body() dto: CreateSubaccountTransferDto,
  ): Promise<AsyncCommandTrackingDto> {
    let subaccount = await this.subaccountRepository.findById(id);
    if (!subaccount) {
      subaccount = await this.subaccountRepository.findByExternalId(id);
    }

    if (!subaccount) {
      throw new NotFoundException(`Subconta "${id}" não encontrada no sistema local`);
    }

    await this.eventPublisher.publish(EVENT_PATTERNS.SUBACCOUNT_TRANSFER, {
      subaccountId: subaccount.id,
      transferData: dto,
    });

    return {
      trackingId: subaccount.id,
      status: 'PROCESSING',
      message: 'Solicitação de transferência para a subconta recebida e enfileirada com sucesso.',
      createdAt: new Date().toISOString(),
      checkStatusUrl: `/subaccounts/${subaccount.externalId}`,
    };
  }
}
