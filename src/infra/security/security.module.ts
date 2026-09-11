import { Global, Module } from '@nestjs/common';
import { CardEncryptionService } from './card-encryption.service';

@Global()
@Module({
  providers: [CardEncryptionService],
  exports: [CardEncryptionService],
})
export class SecurityModule {}
