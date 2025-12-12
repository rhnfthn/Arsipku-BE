import { Module } from '@nestjs/common';
import { PersonService } from './person.service';
import { PersonController } from './person.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from './entities/person.entity';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { OrgDataModule } from '../org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Person, NaskahSirkulasi]),
    OrgDataModule,
  ],
  controllers: [PersonController],
  providers: [PersonService],
})
export class PersonModule {}
