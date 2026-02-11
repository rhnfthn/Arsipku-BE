import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BsreAlertEntity } from '../entities/bsre-alert.entity';
import { BsreAlertStatusDto } from '../dto/bsre-alert.dto';

const DEFAULT_ALERT_MESSAGE = 'Layanan BSrE sedang mengalami gangguan. Mohon coba beberapa saat lagi.';

@Injectable()
export class BsreAlertService {
  constructor(
    @InjectRepository(BsreAlertEntity)
    private readonly alertRepository: Repository<BsreAlertEntity>,
  ) {}

  /**
   * Get or create the singleton alert row
   */
  private async getOrCreateAlert(): Promise<BsreAlertEntity> {
    let alert = await this.alertRepository.findOne({ where: {} });

    if (!alert) {
      alert = this.alertRepository.create({
        id: uuidv4(),
        isActive: false,
        message: null,
        activatedBy: null,
        activatedByName: null,
        activatedAt: null,
        deactivatedAt: null,
      });
      await this.alertRepository.save(alert);
    }

    return alert;
  }

  /**
   * Get current alert status
   * Called by ALL users to check if BSrE disruption alert is active
   */
  async getAlertStatus(): Promise<BsreAlertStatusDto> {
    const alert = await this.getOrCreateAlert();

    return {
      isActive: !!alert.isActive,
      message: alert.isActive ? alert.message : null,
      activatedAt: alert.isActive ? alert.activatedAt : null,
      activatedByName: alert.isActive ? alert.activatedByName : null,
    };
  }

  /**
   * Activate alert - show disruption banner to all users
   */
  async activateAlert(
    userPersnum: number,
    userName: string,
    message?: string,
  ): Promise<BsreAlertStatusDto> {
    const alert = await this.getOrCreateAlert();

    alert.isActive = true;
    alert.message = message || DEFAULT_ALERT_MESSAGE;
    alert.activatedBy = userPersnum;
    alert.activatedByName = userName;
    alert.activatedAt = new Date();
    alert.deactivatedAt = null;

    await this.alertRepository.save(alert);

    return {
      isActive: true,
      message: alert.message,
      activatedAt: alert.activatedAt,
      activatedByName: alert.activatedByName,
    };
  }

  /**
   * Deactivate alert - remove disruption banner for all users
   */
  async deactivateAlert(
    userPersnum: number,
    userName: string,
  ): Promise<BsreAlertStatusDto> {
    const alert = await this.getOrCreateAlert();

    alert.isActive = false;
    alert.deactivatedAt = new Date();

    await this.alertRepository.save(alert);

    return {
      isActive: false,
      message: null,
      activatedAt: null,
      activatedByName: null,
    };
  }

  /**
   * Toggle alert (flip current state)
   */
  async toggleAlert(
    userPersnum: number,
    userName: string,
    message?: string,
  ): Promise<BsreAlertStatusDto> {
    const alert = await this.getOrCreateAlert();

    if (alert.isActive) {
      return this.deactivateAlert(userPersnum, userName);
    } else {
      return this.activateAlert(userPersnum, userName, message);
    }
  }
}
