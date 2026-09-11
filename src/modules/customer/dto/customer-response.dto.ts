import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-469b-b51f-5e488d5e1b20' })
  id: string;

  @ApiProperty({ example: 'user_uuid_123' })
  externalId: string;

  @ApiPropertyOptional({ example: 'cus_000005401844', nullable: true })
  asaasCustomerId?: string | null;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'john.doe@asaas.com.br' })
  email: string;

  @ApiPropertyOptional({ example: '24971563792', nullable: true })
  cpfCnpj?: string | null;

  @ApiPropertyOptional({ example: '4738010919', nullable: true })
  phone?: string | null;

  @ApiProperty({ example: 'SYNCED', enum: ['RECEIVED', 'SYNCED', 'FAILED'] })
  status: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  failureReason?: string | null;

  @ApiProperty({ example: '2026-09-10T15:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-10T15:30:02.000Z' })
  updatedAt: Date;
}
