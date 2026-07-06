import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { FcmTokenEntity } from '../entities';
import { RegisterFcmTokenDto, RemoveFcmTokenDto } from '../dto';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(
    @InjectRepository(FcmTokenEntity)
    private readonly fcmTokenRepository: Repository<FcmTokenEntity>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin SDK
   * Supports: JSON string, JSON file path, or individual env variables
   */
  private async initializeFirebase() {
    try {
      this.logger.log('Starting Firebase initialization...');

      // Check if already initialized
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.apps[0];
        this.logger.log('Firebase Admin SDK already initialized');
        return;
      }

      // Get configuration from environment
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      // Option 1: Load from FIREBASE_SERVICE_ACCOUNT_PATH (JSON string or file path)
      if (serviceAccountPath && serviceAccountPath.trim()) {
        try {
          let serviceAccount: any;

          // Check if it's a JSON string (starts with '{')
          if (serviceAccountPath.trim().startsWith('{')) {
            // It's a JSON string - parse it directly
            this.logger.log('Detected JSON string in FIREBASE_SERVICE_ACCOUNT_PATH');

            let jsonString = serviceAccountPath;

            // Unescape quotes if needed (from .env file)
            if (jsonString.includes('\\"')) {
              jsonString = jsonString.replace(/\\"/g, '"');
            }

            // Parse JSON
            serviceAccount = JSON.parse(jsonString);

            // Fix newlines in private_key (they come as literal \n from env vars)
            if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
              serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }

            this.logger.log(`Firebase service account parsed from JSON: ${serviceAccount.client_email}`);
          } else {
            // It's a file path - read from file
            const absolutePath = path.isAbsolute(serviceAccountPath)
              ? serviceAccountPath
              : path.join(process.cwd(), serviceAccountPath);

            this.logger.log(`Resolved file path: ${absolutePath}`);

            if (!fs.existsSync(absolutePath)) {
              this.logger.warn(`Firebase service account file not found: ${absolutePath}`);
              // Don't return, fall through to try other options
            } else {
              const serviceAccountJson = fs.readFileSync(absolutePath, 'utf8');
              serviceAccount = JSON.parse(serviceAccountJson);
              this.logger.log(`Firebase service account loaded from file: ${serviceAccount.client_email}`);
            }
          }

          if (serviceAccount) {
            this.firebaseApp = admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
            this.logger.log('Firebase Admin SDK initialized successfully');
            return;
          }
        } catch (parseError) {
          this.logger.error('Failed to parse service account:', parseError);
          // Fall through to try other options
        }
      }

      // Option 2: Load from individual env variables
      if (projectId && clientEmail && privateKey) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });

        this.logger.log('Firebase Admin SDK initialized from env variables');
        return;
      }

      // Option 3: Use application default credentials (for cloud deployment)
      if (projectId) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: projectId,
        });
        this.logger.log('Firebase Admin SDK initialized with application default credentials');
        return;
      }

      this.logger.warn('Firebase credentials not configured. Push notifications will be disabled.');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  /**
   * Check if Firebase is initialized
   */
  isFirebaseInitialized(): boolean {
    return this.firebaseApp !== null;
  }

  /**
   * Register or update FCM token for a user
   */
  async registerToken(
    userPersnum: number,
    dto: RegisterFcmTokenDto,
  ): Promise<FcmTokenEntity> {
    const { token, deviceId, platform } = dto;

    // Check if token already exists for this user and device
    let existingToken = await this.fcmTokenRepository.findOne({
      where: { userPersnum, deviceId },
    });

    if (existingToken) {
      // Update existing token
      existingToken.token = token;
      existingToken.platform = platform;
      existingToken.isActive = true;
      existingToken.lastUsedAt = new Date();
      return this.fcmTokenRepository.save(existingToken);
    }

    // Check if same token exists for different device (token is unique)
    const tokenExists = await this.fcmTokenRepository.findOne({
      where: { token },
    });

    if (tokenExists) {
      // Update the existing token record with new device info
      tokenExists.userPersnum = userPersnum;
      tokenExists.deviceId = deviceId;
      tokenExists.platform = platform;
      tokenExists.isActive = true;
      tokenExists.lastUsedAt = new Date();
      return this.fcmTokenRepository.save(tokenExists);
    }

    // Create new token
    const newToken = this.fcmTokenRepository.create({
      id: uuidv4(),
      userPersnum,
      token,
      deviceId,
      platform,
      isActive: true,
      lastUsedAt: new Date(),
    });

    return this.fcmTokenRepository.save(newToken);
  }

  /**
   * Remove FCM token (on logout)
   */
  async removeToken(
    userPersnum: number,
    dto: RemoveFcmTokenDto,
  ): Promise<boolean> {
    const { token, deviceId } = dto;

    if (token) {
      const result = await this.fcmTokenRepository.delete({
        userPersnum,
        token,
      });
      return (result.affected ?? 0) > 0;
    }

    if (deviceId) {
      const result = await this.fcmTokenRepository.delete({
        userPersnum,
        deviceId,
      });
      return (result.affected ?? 0) > 0;
    }

    return false;
  }

  /**
   * Remove all tokens for a user (security event)
   */
  async removeAllUserTokens(userPersnum: number): Promise<number> {
    const result = await this.fcmTokenRepository.delete({ userPersnum });
    return result.affected ?? 0;
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(userPersnum: number): Promise<FcmTokenEntity[]> {
    return this.fcmTokenRepository.find({
      where: { userPersnum, isActive: true },
    });
  }

  /**
   * Send push notification to a single user
   */
  async sendToUser(
    userPersnum: number,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ success: number; failure: number }> {
    if (!this.isFirebaseInitialized()) {
      this.logger.warn('Firebase not initialized. Skipping push notification.');
      return { success: 0, failure: 0 };
    }

    const tokens = await this.getUserTokens(userPersnum);
    if (tokens.length === 0) {
      this.logger.debug(`No FCM tokens found for user ${userPersnum}`);
      return { success: 0, failure: 0 };
    }

    const tokenStrings = tokens.map((t) => t.token);
    return this.sendToTokens(tokenStrings, title, body, data);
  }

  /**
   * Send push notification to multiple users
   */
  async sendToUsers(
    userPersnums: number[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ success: number; failure: number }> {
    if (!this.isFirebaseInitialized()) {
      this.logger.warn('Firebase not initialized. Skipping push notification.');
      return { success: 0, failure: 0 };
    }

    const tokens = await this.fcmTokenRepository.find({
      where: userPersnums.map((persnum) => ({ userPersnum: persnum, isActive: true })),
    });

    if (tokens.length === 0) {
      return { success: 0, failure: 0 };
    }

    const tokenStrings = tokens.map((t) => t.token);
    return this.sendToTokens(tokenStrings, title, body, data);
  }

  /**
   * Send push notification to specific tokens
   */
  private async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ success: number; failure: number }> {
    if (tokens.length === 0) {
      return { success: 0, failure: 0 };
    }

    // Send as data-only message (no `notification` key).
    // Title and body are stored under custom keys (notifTitle/notifBody)
    // to prevent Firebase from auto-parsing them into a `notification` payload
    // which would cause the OS to display its own notification (duplicate).
    const dataPayload = {
      ...(data || {}),
      notifTitle: title,
      notifBody: body,
    };

    const message: admin.messaging.MulticastMessage = {
      tokens,
      data: dataPayload,
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);

      // Handle invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokens[idx]);
            }
            this.logger.warn(`FCM send failed for token: ${errorCode}`);
          }
        });

        // Remove invalid tokens from database
        if (invalidTokens.length > 0) {
          await this.removeInvalidTokens(invalidTokens);
        }
      }

      this.logger.log(
        `FCM sent: ${response.successCount} success, ${response.failureCount} failure`,
      );

      return {
        success: response.successCount,
        failure: response.failureCount,
      };
    } catch (error) {
      this.logger.error('Failed to send FCM notification', error);
      return { success: 0, failure: tokens.length };
    }
  }

  /**
   * Remove invalid tokens from database
   */
  private async removeInvalidTokens(tokens: string[]): Promise<void> {
    for (const token of tokens) {
      await this.fcmTokenRepository.delete({ token });
    }
    this.logger.log(`Removed ${tokens.length} invalid FCM tokens`);
  }
}
