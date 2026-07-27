import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Schema Mongoose untuk collection `audit_trails` di MongoDB (arsipku_audit).
 *
 * Menggantikan AuditTrailEntity (TypeORM). Field sama persis agar response
 * API tetap konsisten dengan frontend.
 *
 * Catatan: id lama (char(36) UUID) kini jadi _id default MongoDB (ObjectId).
 * Field `id` virtual tetap dikembalikan ke client agar kompatibel.
 */
export type AuditTrailDocument = HydratedDocument<AuditTrail>;

@Schema({
  collection: 'audit_trails',
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
export class AuditTrail {
  @Prop({ type: Date })
  createdAt: Date;
  @Prop({ type: String, index: true })
  userId: string | null;

  @Prop({ type: Number, index: true })
  persnum: number | null;

  @Prop({ type: String })
  userName: string | null;

  @Prop({ type: String })
  userEmail: string | null;

  @Prop({ type: String })
  userRole: string | null;

  @Prop({ type: String })
  idPosition: string | null;

  @Prop({ type: String })
  unitKerja: string | null;

  @Prop({ type: String, required: true, index: true })
  action: string;

  @Prop({ type: String, required: true, index: true })
  module: string;

  @Prop({ type: String, index: true })
  entityType: string | null;

  @Prop({ type: String })
  entityId: string | null;

  @Prop({ type: String })
  subEntityType: string | null;

  @Prop({ type: String })
  subEntityId: string | null;

  @Prop({ type: String })
  description: string | null;

  @Prop({ type: Object })
  oldValue: any;

  @Prop({ type: Object })
  newValue: any;

  @Prop({ type: String })
  ipAddress: string | null;

  @Prop({ type: String })
  userAgent: string | null;

  @Prop({ type: String })
  requestMethod: string | null;

  @Prop({ type: String })
  requestUrl: string | null;

  @Prop({ type: String, default: 'SUCCESS', index: true })
  status: string;

  @Prop({ type: String })
  errorMessage: string | null;

  @Prop({ type: Object })
  metadata: any;
}

export const AuditTrailSchema = SchemaFactory.createForClass(AuditTrail);
