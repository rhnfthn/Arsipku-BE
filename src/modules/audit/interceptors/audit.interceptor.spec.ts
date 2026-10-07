import { Reflector } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { AuditTrailService } from '../services/audit-trail.service';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditModule } from '../enums/audit-module.enum';
import { AuditStatus } from '../enums/audit-status.enum';

describe('Forum audit privacy', () => {
  it('records comment activity without copying plaintext into the audit database', () => {
    const createAsync = jest.fn();
    const interceptor = new AuditInterceptor(new Reflector(), {
      createAsync,
    } as unknown as AuditTrailService);
    interceptor['logAudit'](
      { module: AuditModule.TUGAS, action: AuditAction.CREATE },
      { persnum: 1 },
      'POST',
      '/tugas/boards/board-id/comments',
      null,
      null,
      AuditStatus.SUCCESS,
      null,
      {
        status: 'success',
        message: 'Komentar berhasil ditambahkan',
        data: { id: 'comment-id', isi: 'private message' },
      },
    );
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(createAsync.mock.calls[0])).not.toContain(
      'private message',
    );
    expect(createAsync.mock.calls[0][0]).toMatchObject({
      entityId: 'comment-id',
      newValue: { content: '[ENCRYPTED FORUM CONTENT OMITTED]' },
    });
  });
});
