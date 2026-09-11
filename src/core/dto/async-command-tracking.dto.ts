import { ApiProperty } from '@nestjs/swagger';

export class AsyncCommandTrackingDto {
  @ApiProperty({
    description: 'Identificador único de rastreamento do comando gerado pela API local',
    example: 'd3b07384-d113-469b-b51f-5e488d5e1b20',
  })
  trackingId: string;

  @ApiProperty({
    description: 'Status atual do comando enfileirado',
    example: 'RECEIVED',
    enum: ['RECEIVED', 'PROCESSING', 'SYNCED', 'PENDING', 'CONFIRMED', 'ACTIVE', 'INACTIVE', 'FAILED'],
  })
  status: string;

  @ApiProperty({
    description: 'Mensagem informativa sobre o enfileiramento',
    example: 'Solicitação recebida com sucesso e enfileirada para processamento.',
  })
  message: string;

  @ApiProperty({
    description: 'Data e hora ISO-8601 da recepção do comando',
    example: '2026-09-10T15:30:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Endpoint para consulta do status atualizado do recurso (polling)',
    example: '/customers/user_uuid_123',
  })
  checkStatusUrl: string;
}
