import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegalRoleEntity } from '../entities/legal-role.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { DelegasiEntity } from '../../delegasi/entities/delegasi.entity';
import { PositionStatus } from '../../../common/enums/position-status.enum';

const LEGAL_UNIT_ID = 10002099;

export interface LegalPerson {
  positionId: string;
  persnum: number | null;
  nama: string;
  jabatan: string;
  unitId: number;
  unitName: string;
  level: number;
  chief: boolean;
  isActive: boolean;
  isFirstRecipient: boolean;
  /** Aktor pengganti dari delegasi PT/PH/PS yang masih aktif. */
  isDelegasi?: boolean;
  positionStatus?: PositionStatus | null;
}

@Injectable()
export class LegalRoleService {
  constructor(
    @InjectRepository(LegalRoleEntity)
    private readonly legalRoleRepo: Repository<LegalRoleEntity>,
    @InjectRepository(DelegasiEntity)
    private readonly delegasiRepo: Repository<DelegasiEntity>,
    private readonly orgDataService: OrgDataService,
  ) {}

  /**
   * Ambil semua person di unit Legal (10002099) dari org_data tree,
   * merge dengan tabel legal_role untuk status aktif/non-aktif.
   */
  async findAll(): Promise<LegalPerson[]> {
    const orgData = await this.orgDataService.findLatestOrg();
    if (!orgData || !orgData.organization_json) return [];

    const tree =
      typeof orgData.organization_json === 'string'
        ? JSON.parse(orgData.organization_json)
        : orgData.organization_json;

    // Walk tree, collect all persons under unit 10002099
    const persons: Omit<LegalPerson, 'isActive' | 'isFirstRecipient'>[] = [];
    const walk = (node: any) => {
      if (!node) return;
      // Cek apakah node ini atau ancestor-nya adalah unit Legal
      // Kita mulai dari unit Legal, jadi semua node di subtree = legal
      if (node.id === LEGAL_UNIT_ID) {
        collectFromSubtree(node);
        return;
      }
      // Cari di children
      if (node.children) {
        for (const child of node.children) walk(child);
      }
      // Cari di top-level array
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
      }
    };

    const collectFromSubtree = (node: any) => {
      const unitId = node.id ?? LEGAL_UNIT_ID;
      const unitName = node.name ?? '';
      const level = node.level ?? 0;

      if (node.positions) {
        for (const p of node.positions) {
          const person = p.person || {};
          persons.push({
            positionId: String(p.position),
            persnum: person.persnum ? Number(person.persnum) : null,
            nama: person.persnum_text || '(kosong)',
            jabatan: p.position_text || '',
            unitId,
            unitName,
            level,
            chief: p.chief === 1,
          });
        }
      }
      if (node.children) {
        for (const child of node.children) collectFromSubtree(child);
      }
    };

    walk(tree);

    // Load legal_role entries untuk merge status, sekaligus delegasi aktif
    // PT/PH/PS untuk posisi Legal. Aktor delegasi menggantikan nama/persnum
    // recipient, tetapi jabatan dan positionId tetap milik posisi Legalnya.
    const positionIds = persons.map((person) => person.positionId);
    const today = new Date();
    const [roles, delegasiAktif] = await Promise.all([
      this.legalRoleRepo.find(),
      positionIds.length
        ? this.delegasiRepo
            .createQueryBuilder('delegasi')
            .where('delegasi.as_position IN (:...positionIds)', { positionIds })
            .andWhere('delegasi.start_date <= :today', { today })
            .andWhere('delegasi.end_date >= :today', { today })
            .andWhere('delegasi.position_status IN (:...statuses)', {
              statuses: [
                PositionStatus.PT,
                PositionStatus.PH,
                PositionStatus.PS,
              ],
            })
            .orderBy('delegasi.update_at', 'DESC')
            .getMany()
        : Promise.resolve([]),
    ]);
    const roleMap = new Map(roles.map((r) => [r.positionId, r]));
    const delegasiMap = new Map<string, DelegasiEntity>();
    for (const delegasi of delegasiAktif) {
      const positionId = String(delegasi.as_position ?? '');
      if (positionId && !delegasiMap.has(positionId)) {
        delegasiMap.set(positionId, delegasi);
      }
    }

    // Merge: jika ada di legal_role, pakai isActive dari sana.
    // Jika belum ada, default isActive = true.
    const merged = persons.map((p) => {
      const delegasi = delegasiMap.get(p.positionId);
      const role = roleMap.get(p.positionId);
      return {
        ...p,
        // Aktor PT/PH/PS yang aktif harus menjadi tujuan approval. Fallback ke
        // penghuni definitif/(kosong) bila tidak ada delegasi aktif.
        persnum: delegasi?.as_persnum ? Number(delegasi.as_persnum) : p.persnum,
        nama: delegasi?.as_name?.trim() || p.nama,
        isActive: role ? role.isActive : true,
        isFirstRecipient: !!role?.isFirstRecipient,
        isDelegasi: !!delegasi,
        positionStatus: delegasi?.position_status ?? null,
      };
    });

    // Instalasi lama belum memiliki pilihan tersimpan. Agar workflow tidak
    // terhenti setelah migrasi, anggota aktif teratas menjadi fallback dinamis.
    const configuredFirst = merged.find(
      (person) => person.isActive && person.isFirstRecipient,
    );
    const fallbackFirst = [...merged]
      .filter((person) => person.isActive)
      .sort(
        (a, b) =>
          Number(b.chief) - Number(a.chief) || Number(a.level) - Number(b.level),
      )[0];
    const effectiveFirstPositionId =
      configuredFirst?.positionId ?? fallbackFirst?.positionId;

    return merged.map((person) => ({
      ...person,
      isFirstRecipient:
        person.isActive && person.positionId === effectiveFirstPositionId,
    }));
  }

  /**
   * Toggle aktif/non-aktif untuk positionId tertentu.
   * Jika belum ada di tabel, insert baru dengan isActive = false (karena default true).
   */
  async toggle(
    positionId: string,
  ): Promise<{ positionId: string; isActive: boolean }> {
    // Ambil data person dari org_data untuk dapat nama/jabatan
    const all = await this.findAll();
    const person = all.find((p) => p.positionId === positionId);
    if (!person) {
      return { positionId, isActive: false };
    }

    let role = await this.legalRoleRepo.findOne({ where: { positionId } });
    if (role) {
      role.isActive = !role.isActive;
    } else {
      // Belum ada → insert baru dengan isActive = false (karena default true di org data)
      role = this.legalRoleRepo.create({
        positionId,
        persnum: person.persnum,
        nama: person.nama,
        jabatan: person.jabatan,
        unitId: person.unitId,
        unitName: person.unitName,
        isActive: false,
      });
    }
    if (!role.isActive && person.isFirstRecipient) {
      role.isFirstRecipient = null;
    }
    await this.legalRoleRepo.save(role);

    // Jika penerima pertama dinonaktifkan, pindahkan otomatis ke anggota aktif
    // berikutnya supaya entry point Legal Drafting tidak kosong.
    if (!role.isActive && person.isFirstRecipient) {
      const nextRecipient = all.find(
        (candidate) =>
          candidate.positionId !== positionId && candidate.isActive,
      );
      if (nextRecipient) {
        await this.setFirstRecipient(nextRecipient.positionId);
      }
    }
    return { positionId, isActive: role.isActive };
  }

  async setFirstRecipient(
    positionId: string,
  ): Promise<{ positionId: string; isFirstRecipient: true }> {
    const all = await this.findAll();
    const person = all.find((item) => item.positionId === positionId);
    if (!person) {
      throw new NotFoundException('Personil Unit Legal tidak ditemukan.');
    }
    if (!person.isActive) {
      throw new BadRequestException(
        'Penerima pertama harus merupakan personil yang aktif.',
      );
    }

    await this.legalRoleRepo.manager.transaction(async (manager) => {
      await manager.update(
        LegalRoleEntity,
        { isFirstRecipient: true },
        { isFirstRecipient: null },
      );

      let role = await manager.findOne(LegalRoleEntity, {
        where: { positionId },
      });
      if (!role) {
        role = manager.create(LegalRoleEntity, {
          positionId,
          persnum: person.persnum,
          nama: person.nama,
          jabatan: person.jabatan,
          unitId: person.unitId,
          unitName: person.unitName,
          isActive: true,
          isFirstRecipient: true,
        });
      } else {
        role.isFirstRecipient = true;
      }
      await manager.save(role);
    });

    return { positionId, isFirstRecipient: true };
  }

  /**
   * Ambil semua positionId yang aktif (dipakai oleh naskah-lainnya workflow).
   */
  async getActivePositionIds(): Promise<string[]> {
    const all = await this.findAll();
    return all.filter((p) => p.isActive).map((p) => p.positionId);
  }
}
