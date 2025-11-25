import { Column, Entity, UpdateDateColumn, Unique, PrimaryGeneratedColumn } from "typeorm";

@Entity("om_relation_oo", { schema: "navmail" })
@Unique("UQ_oo", ["startDate", "organization", "relation_organization", "company"])
export class RelationOo {
  @Column("char", { primary: true, name: "id", length: 36 })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column("int", { name: "company", nullable: true })
  company: number | null;

  @Column("date", {
    name: "start_date",
    nullable: true,
    default: () => "'2025-01-01'",
  })
  startDate: string | null;

  @Column("date", {
    name: "end_date",
    nullable: true,
    default: () => "'9999-12-31'",
  })
  endDate: string | null;

  @Column("int", { name: "organization", nullable: true })
  organization: number | null;

  @Column("varchar", { name: "organization_text", nullable: true, length: 200 })
  organization_text: string | null;

  @Column("int", { name: "relation_organization", nullable: true })
  relation_organization: number | null;

  @Column("varchar", { name: "relation_organization_text", nullable: true, length: 200 })
  relation_organization_text: string | null;

  @Column("datetime", {
    name: "create_at",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  createAt: Date | null;

  @UpdateDateColumn({ name: 'update_at', type: 'datetime' })
  updateAt: Date | null;

  @Column("varchar", { name: "uname", nullable: true, length: 11 })
  uname: string | null;
}
