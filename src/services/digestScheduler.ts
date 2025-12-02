import * as cron from 'node-cron';
import { DigestService } from './digestService';
import { NotificationService } from './notificationService';
import { logger } from '../utils/logger';

export interface DigestRecipient {
  userId: string;
  email: string;
  name?: string;
}

export class DigestScheduler {
  private digestService: DigestService;
  private notificationService: NotificationService;
  private cronJob?: ReturnType<typeof cron.schedule>;

  constructor(
    digestService: DigestService,
    notificationService: NotificationService
  ) {
    this.digestService = digestService;
    this.notificationService = notificationService;
  }

  start(
    cronExpression: string = this.getDefaultCronExpression(),
    recipients?: DigestRecipient[]
  ): void {
    logger.info('Starting digest scheduler', {
      cronExpression,
      recipientsProvided: !!recipients,
    });

    this.cronJob = cron.schedule(cronExpression, async () => {
      logger.info('Running scheduled digest job');
      await this.sendDigests(recipients);
    });
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Digest scheduler stopped');
    }
  }

  async sendDigests(
    recipients: DigestRecipient[] = this.resolveEnvRecipients()
  ): Promise<void> {
    if (!recipients.length) {
      logger.warn('No digest recipients resolved; skipping send');
      return;
    }

    for (const recipient of recipients) {
      await this.sendDigestToRecipient(recipient);
    }
  }

  async sendDigestNow(userId: string, email?: string): Promise<boolean> {
    const recipientEmail = email || this.inferEmailFromUserId(userId);

    if (!recipientEmail) {
      throw new Error(
        'Recipient email is required when userId is not an email address'
      );
    }

    return this.sendDigestToRecipient({ userId, email: recipientEmail });
  }

  private async sendDigestToRecipient(
    recipient: DigestRecipient
  ): Promise<boolean> {
    try {
      const payload = await this.digestService.buildDailyDigest(recipient.userId);

      return await this.notificationService.sendNotification(
        recipient.userId,
        payload.textBody,
        'email',
        {
          to: recipient.email,
          subject: payload.subject,
          html: payload.htmlBody,
          metadata: {
            previewText: payload.previewText,
            generatedAt: payload.generatedAt,
          },
        }
      );
    } catch (error) {
      logger.error('Failed to send digest to recipient', {
        recipient,
        error,
      });
      return false;
    }
  }

  private getDefaultCronExpression(): string {
    const hour = process.env.DIGEST_SEND_HOUR || '09:00';
    const [h, m] = hour.split(':').map((part) => parseInt(part, 10));

    if (
      Number.isNaN(h) ||
      Number.isNaN(m) ||
      h < 0 ||
      h > 23 ||
      m < 0 ||
      m > 59
    ) {
      logger.warn('Invalid DIGEST_SEND_HOUR value, defaulting to 09:00');
      return '0 9 * * *';
    }

    return `${m} ${h} * * *`;
  }

  private resolveEnvRecipients(): DigestRecipient[] {
    const envValue = process.env.DIGEST_DEFAULT_RECIPIENTS;

    if (!envValue) {
      return [];
    }

    return envValue
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({
        userId: this.inferUserIdFromEmail(email),
        email,
      }));
  }

  private inferEmailFromUserId(userId: string): string | undefined {
    return userId.includes('@') ? userId : undefined;
  }

  private inferUserIdFromEmail(email: string): string {
    return email;
  }
}




