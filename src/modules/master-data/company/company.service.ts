import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OmCompany } from './entities/om-company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OmOrganization } from '../organization/entities/om-organization.entity';
import { OmPosition } from '../position/entities/om-position.entity';
import { Person } from '../person/entities/person.entity';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(OmCompany)
    private readonly companyRepo: Repository<OmCompany>,
    @InjectRepository(OmOrganization)
    private readonly organizationRepo: Repository<OmOrganization>,
    @InjectRepository(OmPosition)
    private readonly positionRepo: Repository<OmPosition>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OmCompany[]> {
    return this.companyRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  /**
   * Get complete organizational tree structure for a company
   * Returns hierarchical structure: Company → Organizations → Positions → Persons
   */
  async getCompanyTree(companyId: number) {
    // Get company info
    const company = await this.companyRepo.findOne({
      where: { company: companyId },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found`);
    }

    // Get all organizations for this company
    const organizations = await this.organizationRepo.find({
      where: { company: companyId },
      order: { organization: 'ASC' },
    });

    // Get all positions for this company
    const positions = await this.positionRepo.find({
      where: { company: companyId },
      order: { position: 'ASC' },
    });

    // Get all persons linked to positions in this company via om_relation_sp
    const personsQuery = `
      SELECT DISTINCT 
        p.*,
        rsp.position,
        rsp.company,
        pos.short_text as position_name
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      LEFT JOIN om_position pos ON pos.position = rsp.position AND pos.company = rsp.company
      WHERE rsp.company = ?
      ORDER BY p.name ASC
    `;

    const persons = await this.dataSource.query(personsQuery, [companyId]);

    // Build hierarchical structure
    const organizationsWithDetails = organizations.map((org) => {
      // Get positions for this organization (if you have org-position relation)
      // For now, including all positions in company
      const orgPositions = positions.map((pos) => {
        // Get persons for this position
        const posPersons = persons.filter(
          (person: any) =>
            person.position === pos.position && person.company === companyId,
        );

        return {
          id: pos.id,
          position: pos.position,
          positionName: pos.shortText,
          positionDescription: pos.longText,
          abbreviation: pos.abbreviation,
          startDate: pos.startDate,
          endDate: pos.endDate,
          personsCount: posPersons.length,
          persons: posPersons.map((person: any) => ({
            id: person.id,
            persnum: person.persnum,
            name: person.name,
            gender: person.gender,
            startDate: person.start_date,
            endDate: person.end_date,
          })),
        };
      });

      return {
        id: org.id,
        organization: org.organization,
        organizationName: org.shortText,
        organizationDescription: org.longText,
        abbreviation: org.abbreviation,
        startDate: org.startDate,
        endDate: org.endDate,
        positionsCount: orgPositions.length,
        personsCount: orgPositions.reduce(
          (sum, pos) => sum + pos.personsCount,
          0,
        ),
        positions: orgPositions,
      };
    });

    // Calculate totals
    const totalOrganizations = organizations.length;
    const totalPositions = positions.length;
    const totalPersons = persons.length;

    return {
      company: {
        id: company.id,
        companyId: company.company,
        companyName: company.shortText,
        companyDescription: company.longText,
        startDate: company.startDate,
        endDate: company.endDate,
      },
      statistics: {
        totalOrganizations,
        totalPositions,
        totalPersons,
      },
      organizations: organizationsWithDetails,
    };
  }

  async findOne(id: string): Promise<OmCompany> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  /**
   * Generate kode perusahaan 4 digit berikutnya.
   * Dimulai dari 1000 untuk perusahaan pertama, n+1 untuk selanjutnya.
   * Hanya menghitung kode dalam rentang 1000–9999 (4 digit), sehingga
   * kode legacy seperti 10000 (PERUM LPPNPI), 90001, 90002, 1, 123 diabaikan.
   */
  private async generateCompanyCode(): Promise<number> {
    const result = await this.companyRepo
      .createQueryBuilder('company')
      .select('MAX(company.company)', 'maxCode')
      .where('company.company >= 1000 AND company.company < 10000')
      .getRawOne();

    const maxCode = result?.maxCode ? Number(result.maxCode) : 0;
    return Math.max(maxCode + 1, 1000);
  }

  async create(dto: CreateCompanyDto): Promise<OmCompany> {
    // Kode perusahaan: pakai dari payload jika dikirim (user bisa ubah),
    // selain itu auto-generate (4 digit, mulai 1000).
    const { company, endDate, ...rest } = dto;
    const companyCode = company ?? (await this.generateCompanyCode());

    const newCompany = this.companyRepo.create({
      ...rest,
      company: companyCode,
      // Nama selalu disimpan KAPITAL.
      shortText: rest.shortText?.toUpperCase(),
      longText: rest.longText?.toUpperCase(),
      // Default end date 31 Desember 9999.
      endDate: endDate || '9999-12-31',
    });
    return this.companyRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<OmCompany> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    // Nama selalu disimpan KAPITAL.
    if (updated.shortText) updated.shortText = updated.shortText.toUpperCase();
    if (updated.longText) updated.longText = updated.longText.toUpperCase();
    return this.companyRepo.save(updated);
  }

  async checkUsage(id: string): Promise<{
    canDelete: boolean;
    reason?: string;
    details?: {
      orgCount: number;
      posCount: number;
      userCount: number;
      usedPosCount: number;
      usedOrgCount: number;
      suratCount: number;
      relationCount: number;
    };
  }> {
    const company = await this.findOne(id);
    const companyCode = company.company;
    const companyName = company.shortText || company.company;

    // 1. Hitung jumlah Organisasi di company ini
    const orgCount =
      companyCode !== null && companyCode !== undefined
        ? await this.organizationRepo.count({
            where: { company: companyCode },
          })
        : 0;

    // 2. Hitung jumlah Posisi / Jabatan di company ini
    const posCount =
      companyCode !== null && companyCode !== undefined
        ? await this.positionRepo.count({
            where: { company: companyCode },
          })
        : 0;

    // 3. Cek apakah posisi/jabatan di company ini SUDAH TERPAKAI di naskah / sirkulasi / approval / berkas
    let usedPosCount = 0;
    try {
      const posUsageRes = await this.dataSource.query(
        `SELECT COUNT(DISTINCT p.id) as cnt
         FROM om_position p
         WHERE p.company = ?
           AND (
             p.id IN (SELECT DISTINCT created_by_position FROM naskah WHERE created_by_position IS NOT NULL)
             OR p.id IN (SELECT DISTINCT penandatangan_position_id FROM naskah WHERE penandatangan_position_id IS NOT NULL)
             OR p.id IN (SELECT DISTINCT atas_nama_position_id FROM naskah WHERE atas_nama_position_id IS NOT NULL)
             OR p.position IN (SELECT DISTINCT position FROM naskah_sirkulasi WHERE position IS NOT NULL)
             OR p.id IN (SELECT DISTINCT position_id FROM naskah_lainnya_approval WHERE position_id IS NOT NULL)
             OR p.id IN (SELECT DISTINCT pic_position_id FROM berkas WHERE pic_position_id IS NOT NULL)
           )`,
        [companyCode],
      );
      usedPosCount = Number(posUsageRes[0]?.cnt || 0);
    } catch (e) {
      console.warn('Gagal cek used positions in company:', e.message);
    }

    // 4. Cek apakah organisasi di company ini SUDAH TERPAKAI di naskah_sirkulasi / naskah_dinas_verifikator / konsep
    let usedOrgCount = 0;
    try {
      const orgUsageRes = await this.dataSource.query(
        `SELECT COUNT(DISTINCT o.id) as cnt
         FROM om_organization o
         WHERE o.company = ?
           AND (
             o.organization IN (SELECT DISTINCT organization FROM naskah_sirkulasi WHERE organization IS NOT NULL)
             OR o.organization IN (SELECT DISTINCT organization FROM naskah_dinas_verifikator WHERE organization IS NOT NULL)
             OR o.organization IN (SELECT DISTINCT from_organization FROM konsep WHERE from_organization IS NOT NULL)
             OR o.organization IN (SELECT DISTINCT to_organization FROM konsep WHERE to_organization IS NOT NULL)
           )`,
        [companyCode],
      );
      usedOrgCount = Number(orgUsageRes[0]?.cnt || 0);
    } catch (e) {
      console.warn('Gagal cek used organizations in company:', e.message);
    }

    // 5. Cek Users / Personel yang terkait dengan company ini atau relasi SP
    let userCount = 0;
    try {
      const userRes = await this.dataSource.query(
        `SELECT COUNT(DISTINCT persnum) as cnt FROM om_relation_sp WHERE company = ?`,
        [companyCode],
      );
      userCount = Number(userRes[0]?.cnt || 0);
    } catch (e) {
      console.warn('Gagal cek relation_sp by company:', e.message);
    }

    // 6. Cek Relasi Hierarki (OO, OA, OS) di company ini
    let relationCount = 0;
    try {
      const relRes = await this.dataSource.query(
        `SELECT 
           (SELECT COUNT(id) FROM om_relation_oo WHERE company = ?) +
           (SELECT COUNT(id) FROM om_relation_os WHERE company = ?) +
           (SELECT COUNT(id) FROM om_relation_oa WHERE company = ?) as total_rel`,
        [companyCode, companyCode, companyCode],
      );
      relationCount = Number(relRes[0]?.total_rel || 0);
    } catch (e) {
      console.warn('Gagal cek relations by company:', e.message);
    }

    // 7. Cek surat / naskah yang dibuat oleh posisi dari company ini
    let suratCount = 0;
    try {
      const suratRes = await this.dataSource.query(
        `SELECT COUNT(DISTINCT n.id) as cnt 
         FROM naskah n 
         INNER JOIN om_position p ON (n.created_by_position = p.id OR n.penandatangan_position_id = p.id OR n.atas_nama_position_id = p.id)
         WHERE p.company = ?`,
        [companyCode],
      );
      suratCount = Number(suratRes[0]?.cnt || 0);
    } catch (e) {
      console.warn('Gagal cek naskah by company positions:', e.message);
    }

    if (
      usedPosCount > 0 ||
      usedOrgCount > 0 ||
      suratCount > 0 ||
      userCount > 0
    ) {
      const detailsList: string[] = [];
      if (suratCount > 0) detailsList.push(`${suratCount} Naskah/Surat terbit`);
      if (usedPosCount > 0) detailsList.push(`${usedPosCount} Posisi/Jabatan telah aktif digunakan di naskah/berkas`);
      if (usedOrgCount > 0) detailsList.push(`${usedOrgCount} Unit Organisasi telah aktif digunakan di naskah/konsep`);
      if (userCount > 0) detailsList.push(`${userCount} Pegawai aktif terhubung (Relasi SP)`);

      return {
        canDelete: false,
        reason: `Perusahaan '${companyName}' tidak dapat dihapus karena sudah memiliki aktivitas data (${detailsList.join(', ')}). Data ini tidak dapat dihapus demi menjaga konsistensi riwayat persuratan dan arsip.`,
        details: {
          orgCount,
          posCount,
          userCount,
          usedPosCount,
          usedOrgCount,
          suratCount,
          relationCount,
        },
      };
    }

    return {
      canDelete: true,
      details: {
        orgCount: 0,
        posCount: 0,
        userCount: 0,
        usedPosCount: 0,
        usedOrgCount: 0,
        suratCount: 0,
        relationCount: 0,
      },
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    company.endDate = yesterday.toISOString().slice(0, 10);
    await this.companyRepo.save(company);
    return { message: `Company ${company.shortText || id} deleted successfully` };
  }
}
