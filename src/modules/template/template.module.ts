import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateEntity } from './entities/template.entity';
import { TemplateService } from './services/template.service';
import { TemplateController } from './controllers/template.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TemplateEntity]),
    StorageModule,
  ],
  providers: [TemplateService],
  controllers: [TemplateController],
  exports: [TemplateService],
})
export class TemplateModule {}
