import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { RelationOoService } from '../relation_oo/relation_oo.service';
import { RelationOaService } from '../relation_oa/relation_oa.service';
import { RelationOsService } from '../relation_os/relation_os.service';
import { RelationOscService } from '../relation_osc/relation_osc.service';
import { RelationSpService } from '../relation_sp/relation_sp.service';
import { OrgDataQueryDto, OrgFilterQueryDto } from './dto/org-data-query.dto';
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

type Departs = {
  company: number;
  organization: number;
  tipe: string;
};


@Controller('org-data')
export class OrgDataController {
  constructor(
    private readonly relationOoService: RelationOoService,
    private readonly relationOaService: RelationOaService,
    private readonly relationOsService: RelationOsService,
    private readonly relationOscService: RelationOscService,
    private readonly relationSpService: RelationSpService,
    private readonly relationOdService: RelationOdService,
    private readonly orgBuildService: OrgDataService,
  ) {}

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

  private findNodeByFilter(tree: any[], query: OrgFilterQueryDto): any | null {
    const matchNode = (node: any): boolean => {
      const div = node.divisi;
      const dir = node.direktorat;

      if (
        query.division &&
        div?.name?.toLowerCase().includes(query.division.toLowerCase())
      ) {
        return true;
      }

      if (query.division_id && div?.id === Number(query.division_id)) {
        return true;
      }

      if (
        query.direktorat &&
        dir?.name?.toLowerCase().includes(query.direktorat.toLowerCase())
      ) {
        return true;
      }

      if (query.direktorat_id && dir?.id === Number(query.direktorat_id)) {
        return true;
      }

      return false;
    };

    const dfs = (nodes: any[]): any | null => {
      for (const node of nodes) {
        if (matchNode(node)) return node;

        if (node.children?.length) {
          const found = dfs(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return dfs(tree);
  }

  /**
   * GET /org-data/pengirim/managerial
   * Get all managerial positions (chief=1) from org_data
   *
   * Returns all positions where chief = 1 without any relational filters.
   * Useful for getting list of all managerial users in the organization.
   *
   * @param tgl - Optional date in format YYYY-MM-DD (query parameter, default: today)
   * @returns Array of all managerial positions
   *
   * @throws 404 - Not Found (org_data not found for date)
   */
  @Get('pengirim/managerial')
  async getAllManagerialPositions(@Query() query: OrgFilterQueryDto) {
    return this.orgBuildService.getAllManagerialPositions(query.tgl);
  }

  @Get()
  async getCombinedData(@Query() query: OrgFilterQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
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

    const chiefPositions = new Set(
      (oscData as Chief[]).map((c) => `${c.company}-${c.relation_position}`),
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
            // chief: chiefPositions.has(`${pos.company}-${pos.relation_position}`) ? 1 : 0,
            chief: tbod!=='' ? 1 : 0,
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

      // sort ulang position chief dulu baru staff
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

    // insert jika ada data
    if (treeWithExtra.length > 0) {
      // baris data position
      const barisData = this.flattenOrgTree(treeWithExtra);
      await this.orgBuildService.createOrUpdate(tgl, treeWithExtra, barisData);
    }
    return treeWithExtra;
  }

  @Get('oo')
  async getRelationOo() {
    return this.relationOoService.findAll(); // panggil service dari module lain
  }

  @Get('oa')
  async getRelationOa() {
    return this.relationOaService.findAll(); // panggil service lain juga
  }

  @Get('os')
  async getRelationOs() {
    return this.relationOsService.findAll();
  }

  @Get('osc')
  async getRelationOsc() {
    return this.relationOscService.findAll();
  }

  @Get('sp')
  async getRelationSp() {
    return this.relationSpService.findAll();
  }

  @Get('ood')
  async getRelationOod(@Query() query: OrgDataQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
    return this.relationOoService.findManyRelation(tgl);
  }

  private flattenOrgTree(tree: any[]): any[] {
    const rows: any[] = [];

    // Tambahkan parent ke parameter
    const processNode = (node: any, parent: any | null) => {
      // Jika ada positions, buat row untuk setiap position
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

            // 🔥 Tambahan parent organization
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

      // Proses children, passing node sebagai parent
      if (Array.isArray(node.children)) {
        node.children.forEach((child) => processNode(child, node));
      }
    };

    // Root tidak punya parent, jadi parent = null
    tree.forEach((root) => processNode(root, null));

    // Sorting
    rows.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level; // level ASC
      return b.chief - a.chief; // chief DESC
    });

    return rows;
  }

  @Get('getdata')
  async getOrgs(@Query() query: OrgFilterQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
    const data = await this.orgBuildService.findOrg(tgl);
    const treeWithExtra = data.organization_json;
    // ⛔ TAMBAHKAN CHECK INI
    const noFilter =
      !query.division &&
      !query.division_id &&
      !query.direktorat &&
      !query.direktorat_id;

    if (noFilter) {
      // Jika TIDAK ada query → return seluruh tree
      const orgs = treeWithExtra;
      const barisData = this.flattenOrgTree(orgs);
      return { tree: orgs, barisData: barisData };
    }

    // Jika ADA query → cari subtree yang cocok
    const rootMatch = this.findNodeByFilter(treeWithExtra, query);

    if (rootMatch) {
      const orgs = [rootMatch];
      const barisData = this.flattenOrgTree(orgs);
      return { tree: orgs, barisData: barisData };
      // return [rootMatch]; // start tree from the matched node
    }

    // Jika tidak ketemu → return kosong
    return [];
  }

  private filterByPositionNodin(barisData, positionParam) {
    // cari item current
    const current = barisData.find((x) => Number(x.position) === Number(positionParam));
    if (!current) return [];

    const currentLevel = Number(current.level);

    // 1️⃣ Filter divisi terlebih dahulu
    let filtered;
    let downLevel;
    if(current.departType===null){
      filtered = barisData.filter((x) => Number(x.divisi_id) === Number(current.divisi_id) && x.chief===1 && x.sub_area===current.sub_area);
      downLevel = [];
    } else {
      filtered = barisData.filter((x) => x.chief===1 && x.sub_area===current.sub_area);
      downLevel = filtered.filter((x) => x.level === currentLevel + 1);
    }

    // 2️⃣ Ambil parent (1 level di atas)
    const parentLevel = filtered.filter((x) => x.level === currentLevel - 1 && Number(x.organization_id) === Number(current.organization_parent));

    // 3️⃣ Ambil selevel (kecuali dirinya)
    const sameLevel = filtered.filter(
      (x) => x.level === currentLevel && Number(x.position) !== Number(positionParam),
    );

    // gabungkan: parent → current → same level
    // return [...parentLevel, current, ...sameLevel];
    return [...parentLevel, ...sameLevel, ...downLevel];
  }

  private filterByPositionSudin(barisData, positionParam) {
    // cari item current
    const current = barisData.find((x) => Number(x.position) === Number(positionParam));
    if (!current) return [];

    const filtered = barisData.filter((x) => x.chief===1 && x.sub_area!==current.sub_area && x.departType==='DIVORCABANG');
    return filtered;
  }

  private filterByPositionDispo(barisData, positionParam) {
    // cari item current
    const current = barisData.find((x) => Number(x.position) === Number(positionParam));
    if (!current) return [];

    const currentLevel = Number(current.level);
    const filtered = barisData.filter((x) => x.level === currentLevel + 1 && x.sub_area===current.sub_area && x.organization_parent===current.organization_id && x.chief===1);

    // get staff
    const staffFilter = barisData.filter((x) => x.chief===0 && Number(x.divisi_id)===Number(current.divisi_id));
    return [...filtered, ...staffFilter];
  }

  @Get('dispo-tertuju')
  async getDispoTertuju(@Query() query: OrgDataQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
    const position_id = query.position_id;
    const data = await this.orgBuildService.findOrg(tgl);
    const barisData = data.position_json;
    const result = this.filterByPositionDispo(barisData, position_id);
    return result;
  }

  @Get('nodin-tertuju')
  async getNodinTertuju(@Query() query: OrgDataQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
    const position_id = query.position_id;
    const data = await this.orgBuildService.findOrg(tgl);
    const barisData = data.position_json;
    const result = this.filterByPositionNodin(barisData, position_id);
    return result;
  }

  @Get('sudin-tertuju')
  async getSudinTertuju(@Query() query: OrgDataQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
    const position_id = query.position_id;
    const data = await this.orgBuildService.findOrg(tgl);
    const barisData = data.position_json;
    const result = this.filterByPositionSudin(barisData, position_id);
    return result;
  }

  @Get('my-position')
  async getMyPosition(@Query() query: OrgDataQueryDto) {
    const tgl = query.tgl ?? new Date().toISOString().split('T')[0];
    const data = await this.orgBuildService.findOrg(tgl);
    const barisData = data.position_json;
    if(query.position_id){
      const position_id = query.position_id;
      const current = barisData.find((x) => Number(x.position) === Number(position_id));
      return current;
    }
    if(query.persnum){
      const persnum = query.persnum;
      const current = barisData.find((x) => Number(x.persnum_person) === Number(persnum));
      return current;
    }
    return;
  }
}
