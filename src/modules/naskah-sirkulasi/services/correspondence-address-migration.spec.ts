import { QueryRunner } from 'typeorm';
import { WidenCorrespondenceAddress1791800000000 } from '../../../migrations/1791800000000-WidenCorrespondenceAddress';

describe('Correspondence address rollback', () => {
  it('refuses narrowing when existing addresses would be truncated', async () => {
    const query = jest.fn().mockResolvedValue([{ total: '1' }]);
    await expect(
      new WidenCorrespondenceAddress1791800000000().down({
        query,
      } as unknown as QueryRunner),
    ).rejects.toThrow('akan terpotong');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('allows narrowing when all addresses fit', async () => {
    const query = jest.fn().mockResolvedValue([{ total: '0' }]);
    await new WidenCorrespondenceAddress1791800000000().down({
      query,
    } as unknown as QueryRunner);
    expect(query).toHaveBeenLastCalledWith(
      'ALTER TABLE `naskah_sirkulasi` MODIFY `alamat` VARCHAR(255) NULL',
    );
  });
});
