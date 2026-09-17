import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubaccountResponseDto {
  @ApiProperty({
    description: 'UUID da subconta no banco de dados local da API',
    example: 'd3b07384-d113-469b-b51f-5e488d5e1b20',
  })
  id: string;

  @ApiProperty({
    description: 'ID de referência externa no backend consumidor',
    example: 'freelancer_usr_123',
  })
  externalId: string;

  @ApiPropertyOptional({
    description: 'Identificador único da conta gerada no Asaas',
    example: 'acc_0000000001',
  })
  asaasAccountId: string | null;

  @ApiPropertyOptional({
    description: 'ID único da carteira financeira Asaas para recebimento de splits',
    example: 'bbf67496-1379-4b6d-a348-fd5fa229f1c',
  })
  walletId: string | null;

  @ApiProperty({
    description: 'Nome completo ou Razão Social',
    example: 'João da Silva Desenvolvedor ME',
  })
  name: string;

  @ApiProperty({
    description: 'E-mail do titular',
    example: 'joao.silva@prestador.com',
  })
  email: string;

  @ApiProperty({
    description: 'CPF ou CNPJ cadastrado',
    example: '24971563792',
  })
  cpfCnpj: string;

  @ApiProperty({
    description: 'Indica se a retenção de custódia (Escrow) está ativa para esta subconta',
    example: true,
  })
  escrowEnabled: boolean;

  @ApiPropertyOptional({
    description: 'Dias para expiração automática da garantia de retenção',
    example: 30,
  })
  escrowDaysToExpire: number | null;

  @ApiProperty({
    description: 'Status do registro da subconta',
    example: 'SYNCED',
    enum: ['RECEIVED', 'SYNCED', 'FAILED'],
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Mensagem de erro descritiva caso a sincronização falhe',
    example: null,
  })
  failureReason: string | null;

  @ApiProperty({
    description: 'Data de criação do registro no sistema local',
    example: '2026-09-17T15:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Data da última atualização cadastral',
    example: '2026-09-17T15:00:02.000Z',
  })
  updatedAt: string;
}
