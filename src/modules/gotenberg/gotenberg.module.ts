import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GotenbergService } from './gotenberg.service';

@Module({
  imports: [ConfigModule],
  providers: [GotenbergService],
  exports: [GotenbergService],
})
export class GotenbergModule {}
