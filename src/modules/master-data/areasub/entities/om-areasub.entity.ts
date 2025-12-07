import { Column, Entity, UpdateDateColumn, Unique, PrimaryGeneratedColumn } from "typeorm";

@Entity("om_area_sub", { schema: "navmail" })
@Unique("UQ_area", ["startDate", "area", "company", "sub_area"])
export class OmAreaSub {
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

  @Column("varchar", { name: "area", nullable: true, length: 11 })
  area: string | null;

  @Column("int", { name: "sub_area", nullable: true })
  sub_area: number | null;

  @Column("varchar", { name: "short_text", nullable: true, length: 50 })
  shortText: string | null;

  @Column("varchar", { name: "long_text", nullable: true, length: 250 })
  longText: string | null;

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
