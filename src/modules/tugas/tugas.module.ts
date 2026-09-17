import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { DiEntity } from '../disposisi/entities/di.entity';
import { NaskahLainnyaApprovalEntity } from '../naskah-lainnya/entities/naskah-lainnya-approval.entity';
import { NaskahSirkulasi } from '../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import {
  TugasActivityEntity,
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskCommentEntity,
  TugasTaskEvidenceEntity,
  TugasTaskEntity,
  TugasTaskReferenceEntity,
} from './entities';
import { TugasController } from './controllers';
import {
  TugasAccessReader,
  TugasActivityService,
  TugasBoardService,
  TugasCommentService,
  TugasEvidenceService,
  TugasMemberService,
  TugasNotificationService,
  TugasReferenceResolver,
  TugasReferenceService,
  TugasTaskService,
  TugasTimelineService,
} from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TugasBoardEntity,
      TugasBoardMemberEntity,
      TugasTaskCommentEntity,
      TugasTaskEvidenceEntity,
      TugasTaskEntity,
      TugasTaskReferenceEntity,
      TugasActivityEntity,
      NaskahEntity,
      DiEntity,
      NaskahSirkulasi,
      NaskahLainnyaApprovalEntity,
    ]),
    OrgDataModule,
    RbacModule,
    NotificationModule,
    RealtimeModule,
  ],
  controllers: [TugasController],
  providers: [
    TugasAccessReader,
    TugasActivityService,
    TugasBoardService,
    TugasCommentService,
    TugasEvidenceService,
    TugasMemberService,
    TugasNotificationService,
    TugasReferenceResolver,
    TugasReferenceService,
    TugasTaskService,
    TugasTimelineService,
  ],
  exports: [TugasAccessReader],
})
export class TugasModule {}
