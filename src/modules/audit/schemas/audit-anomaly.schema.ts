import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Schema Mongoose untuk collection `audit_anomalies` di MongoDB (arsipku_audit).
 *
 * Menggantikan AuditAnomalyEntity (TypeORM). Field sama persis agar response
 * API tetap konsisten dengan frontend.
 */
export type AuditAnomalyDocument = HydratedDocument<AuditAnomaly>;

@Schema({
  collection: 'audit_anomalies',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc: any, ret: any) => {
      ret.id = ret._id?.toString?.() ?? ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class AuditAnomaly {
  @Prop({ type: Date })
  createdAt: Date;
  @Prop({ type: Date })
  resolvedAt: Date | null;

  @Prop({ type: String })
  auditTrailId: string | null;

  @Prop({ type: String, required: true })
  anomalyType: string;

  @Prop({ type: String, required: true, index: true })
  severity: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String })
  description: string | null;

  @Prop({ type: String, index: true })
  userId: string | null;

  @Prop({ type: Number, index: true })
  persnum: number | null;

  @Prop({ type: String })
  userName: string | null;

  @Prop({ type: String })
  userRole: string | null;

  @Prop({ type: String })
  ipAddress: string | null;

  @Prop({ type: String })
  relatedModule: string | null;

  @Prop({ type: String })
  relatedEntityType: string | null;

  @Prop({ type: String })
  relatedEntityId: string | null;

  @Prop({ type: Object })
  evidence: any;

  @Prop({ type: String, default: 'NEW', index: true })
  status: string;

  @Prop({ type: String })
  handledBy: string | null;

  @Prop({ type: String })
  handlingNote: string | null;

  @Prop({ type: Boolean, default: false })
  notificationSent: boolean;

  @Prop({ type: Date })
  notificationSentAt: Date | null;
}

export const AuditAnomalySchema = SchemaFactory.createForClass(AuditAnomaly);
