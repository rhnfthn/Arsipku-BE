import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RelationOoService } from '../relation_oo/relation_oo.service';
import { RelationOaService } from '../relation_oa/relation_oa.service';
import { RelationOsService } from '../relation_os/relation_os.service';
import { RelationOscService } from '../relation_osc/relation_osc.service';
import { RelationSpService } from '../relation_sp/relation_sp.service';
import { RelationOdService } from '../relation_od/relation_od.service';
import { OrgDataService } from './org_data.service';

type Org = {
  company: number;
  company_name?: string;
  abbreviation?: string;
  organization: number;
  organization_text: string;
  relation_organization: number | null;
  relation_organization_text: string | null;
  relation_sub_area?: number | null;
  relation_sub_area_text?: string | null;
  area?: string | null;
  area_text?: string | null;
  departType?: string | null;
  positions?: {
    position: number;
    position_text: string;
    chief: number;
    bod_tag: string;
    person: {
      persnum: number;
      persnum_text: string;
    } | null;
  }[];
};

type Area = {
  company: number;
  organization: number;
  relation_sub_area: number;
  relation_sub_area_text: string;
  area: string;
  area_text: string;
};

type Position = {
  company: number;
  abbreviation?: string;
  organization: number;
  relation_position: number;
  relation_position_text: string;
};

type Chief = {
  company: number;
  organization: number;
  relation_position: number;
};

type Person = {
  company: number;
  position: number;
  position_text: string;
  relation_persnum: number;
  relation_persnum_text: string;
};

@Injectable()
export class OrgDataScheduler {
  private readonly logger = new Logger(OrgDataScheduler.name);

  constructor(
    private readonly relationOoService: RelationOoService,
    private readonly relationOaService: RelationOaService,
    private readonly relationOsService: RelationOsService,
    private readonly relationOscService: RelationOscService,
    private readonly relationSpService: RelationSpService,
    private readonly relationOdService: RelationOdService,
    private readonly orgDataService: OrgDataService,
  ) {}

  // Setiap 6 jam: 00:00, 06:00, 12:00, 18:00
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleOrgDataSync() {
    this.logger.log('⏰ [CRON] Mulai sync org-data (setiap 6 jam)...');
    try {
      await this.syncOrgData();
      this.logger.log('✅ [CRON] Sync org-data selesai.');
    } catch (error) {
      this.logger.error(
        '❌ [CRON] Gagal sync org-data:',
        error?.message || error,
      );
    }
  }

  async syncOrgData() {
    // Bug fix: toISOString() converts to UTC. Server TZ=Asia/Jakarta (UTC+7).
    // At 6 AM local, UTC is 11 PM previous day → wrong date.
    // Use local date components instead.
    const now = new Date();
    const tgl = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [ooData, oaData, osData, oscData, spData, odData] = await Promise.all(
      [
        this.relationOoService.findManyRelation(tgl),
        this.relationOaService.findManyRelation(tgl),
        this.relationOsService.findManyRelation(tgl),
        this.relationOscService.findManyByDate(tgl),
        this.relationSpService.findManyByDate(tgl),
        this.relationOdService.findManyByDate(tgl),
      ],
    );

    const tipeDepart = new Map<string, string>();
    odData.forEach((item) => {
      const key = `${item.company}-${item.organization}`;
      tipeDepart.set(key, item.tipe);
    });

    const bodTag = new Map<string, string>();
    oscData.forEach((item) => {
      const key = `${item.company}-${item.relation_position}`;
      bodTag.set(key, item.bod_tag ?? '');
    });

    const mergedData = (ooData as Org[]).map((org) => {
      const matchArea = (oaData as Area[]).find(
        (area) =>
          area.organization === org.organization &&
          area.company === org.company,
      );

      const orgPositions = (osData as Position[])
        .filter(
          (pos) =>
            pos.organization === org.organization &&
            pos.company === org.company,
        )
        .map((pos) => {
          const matchedPerson = (spData as Person[]).find(
            (p) =>
              p.position === pos.relation_position && p.company === pos.company,
          );

          const keybod = `${pos.company}-${pos.relation_position}`;
          const tbod = bodTag.get(keybod) ?? '';

          return {
            abbreviation: pos.abbreviation,
            position: pos.relation_position,
            position_text: pos.relation_position_text,
            chief: tbod !== '' ? 1 : 0,
            bod_tag: tbod,
            person: matchedPerson
              ? {
                  persnum: matchedPerson.relation_persnum,
                  persnum_text: matchedPerson.relation_persnum_text,
                }
              : null,
          };
        });

      const keydepart = `${org.company}-${org.organization}`;
      const depart = tipeDepart.get(keydepart) ?? null;

      const sortPositions = orgPositions.sort((a, b) => b.chief - a.chief);
      return {
        ...org,
        relation_sub_area: matchArea?.relation_sub_area ?? null,
        relation_sub_area_text: matchArea?.relation_sub_area_text ?? null,
        area: matchArea?.area ?? null,
        area_text: matchArea?.area_text ?? null,
        positions: sortPositions,
        departType: depart,
      };
    });

    const tree = this.buildOrgTree(mergedData);
    const treeWithExtra = tree.map((root) =>
      this.injectDivisionAndDirektorat(root),
    );

    if (treeWithExtra.length > 0) {
      const barisData = this.flattenOrgTree(treeWithExtra);
      await this.orgDataService.createOrUpdate(tgl, treeWithExtra, barisData);
    }

    this.logger.log(
      `📊 [CRON] org-data tgl=${tgl}, total tree roots=${treeWithExtra.length}`,
    );
  }

  private injectDivisionAndDirektorat(
    node: any,
    currentDivision: any = null,
    currentDirektorat: any = null,
  ) {
    const lowerName = node.departType?.toLowerCase() ?? '';

    const isDivision = lowerName.includes('divorcabang');
    const isDirektorat = lowerName.includes('direktorat');

    const divisionValue = isDivision
      ? { id: node.id, name: node.name }
      : currentDivision;

    const direktoratValue = isDirektorat
      ? { id: node.id, name: node.name }
      : currentDirektorat;

    node.divisi = divisionValue ?? null;
    node.direktorat = direktoratValue ?? null;

    if (node.children && node.children.length > 0) {
      node.children = node.children.map((child) =>
        this.injectDivisionAndDirektorat(child, divisionValue, direktoratValue),
      );
    }

    return node;
  }

  private buildOrgTree(data: Org[]) {
    const idSet = new Set(data.map((item) => item.organization));

    const roots = data.filter(
      (item) =>
        item.relation_organization === null ||
        !idSet.has(item.relation_organization),
    );

    const buildChildren = (
      parentCompany: number,
      parentId: number,
      level: number,
    ): any[] => {
      return data
        .filter(
          (item) =>
            item.company === parentCompany &&
            item.relation_organization === parentId,
        )
        .map((item) => ({
          company: item.company,
          company_name: item.company_name,
          id: item.organization,
          abbreviation: item.abbreviation,
          name: item.organization_text,
          sub_area: item.relation_sub_area ?? null,
          sub_area_text: item.relation_sub_area_text ?? null,
          area: item.area ?? null,
          area_text: item.area_text ?? null,
          departType: item.departType ?? null,
          positions: item.positions ?? [],
          level,
          children: buildChildren(item.company, item.organization, level + 1),
        }));
    };

    return roots.map((root) => ({
      company: root.company,
      company_name: root.company_name,
      id: root.organization,
      abbreviation: root.abbreviation,
      name: root.organization_text,
      sub_area: root.relation_sub_area ?? null,
      sub_area_text: root.relation_sub_area_text ?? null,
      area: root.area ?? null,
      area_text: root.area_text ?? null,
      departType: root.departType ?? null,
      positions: root.positions ?? [],
      level: 0,
      children: buildChildren(root.company, root.organization, 1),
    }));
  }

  private flattenOrgTree(tree: any[]): any[] {
    const rows: any[] = [];

    const processNode = (node: any, parent: any | null) => {
      if (Array.isArray(node.positions)) {
        for (const pos of node.positions) {
          rows.push({
            position: pos.position,
            position_text: pos.position_text,
            position_abbreviation: pos.abbreviation ?? null,
            chief: pos.chief,
            bod_tag: pos.bod_tag,
            departType: node.departType,

            persnum_person: pos.person?.persnum ?? null,
            persnum_person_text: pos.person?.persnum_text ?? null,

            organization_id: node.id,
            organization_text: node.name,
            organization_abbreviation: node.abbreviation ?? null,

            organization_parent: parent?.id ?? null,
            organization_parent_text: parent?.name ?? null,

            sub_area: node.sub_area ?? null,
            sub_area_text: node.sub_area_text ?? null,
            area: node.area ?? null,
            area_text: node.area_text ?? null,

            level: node.level,

            divisi_id: node.divisi?.id ?? null,
            divisi_name: node.divisi?.name ?? null,

            direktorat_id: node.direktorat?.id ?? null,
            direktorat_name: node.direktorat?.name ?? null,

            company: node.company ?? null,
            company_name: node.company_name ?? null,
          });
        }
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((child) => processNode(child, node));
      }
    };

    tree.forEach((root) => processNode(root, null));

    rows.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return b.chief - a.chief;
    });

    return rows;
  }
}
