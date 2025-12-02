import sgMail from '@sendgrid/mail';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { logger } from '../utils/logger';

export type NotificationChannel = 'email' | 'push' | 'sms' | 'console';
export type EmailProvider = 'ses' | 'sendgrid';

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: NotificationChannel;
  status: 'sent' | 'failed' | 'pending';
  timestamp: Date;
  subject?: string;
  target?: string;
  metadata?: Record<string, any>;
}

export interface NotificationServiceOptions {
  emailProvider?: EmailProvider;
  sendgridApiKey?: string;
  defaultFromEmail?: string;
  defaultFromName?: string;
  simulate?: boolean;
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
  sesConfigurationSetName?: string;
}

export interface NotificationSendOptions {
  to?: string;
  subject?: string;
  html?: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private notifications: Notification[] = [];
  private emailProvider: EmailProvider | null = null;
  private sesClient?: SESv2Client;
  private sesConfigurationSetName?: string;
  private defaultFromEmail?: string;
  private defaultFromName?: string;
  private simulate: boolean;

  constructor(options: NotificationServiceOptions = {}) {
    this.defaultFromEmail = options.defaultFromEmail;
    this.defaultFromName = options.defaultFromName;
    this.simulate = options.simulate ?? false;

    const preferredProvider = options.emailProvider;

    if (
      (preferredProvider === 'ses' || !preferredProvider) &&
      options.sesRegion
    ) {
      this.configureSes(options);
    }

    if (!this.emailProvider && options.sendgridApiKey) {
      this.configureSendgrid(options.sendgridApiKey);
    }

    if (!this.emailProvider) {
      logger.warn(
        'No email provider configured. Email notifications will fall back to console logs.'
      );
    }
  }

  supportsEmail(): boolean {
    return this.emailProvider !== null;
  }

  async sendNotification(
    userId: string,
    message: string,
    type: NotificationChannel = 'console',
    options: NotificationSendOptions = {}
  ): Promise<boolean> {
    const notification: Notification = {
      id: Math.random().toString(36).substring(7),
      userId,
      message,
      type,
      status: 'pending',
      timestamp: new Date(),
      subject: options.subject,
      target: options.to,
      metadata: options.metadata,
    };

    try {
      logger.info(`Preparing to send ${type} notification`, {
        userId,
        channel: type,
        emailProvider: this.emailProvider,
      });

      switch (type) {
        case 'email':
          await this.sendEmail(notification, options);
          break;
        case 'push':
          logger.info(`[SIMULATION] Sending push notification to ${userId}...`);
          break;
        case 'sms':
          logger.info(`[SIMULATION] Sending SMS notification to ${userId}...`);
          break;
        case 'console':
        default:
          console.log(`\n🔔 [NOTIFICATION for ${userId}]:\n${message}\n`);
      }

      notification.status = 'sent';
      this.notifications.push(notification);
      logger.info(`Notification ${notification.id} sent successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to send notification to ${userId}`, { error });
      notification.status = 'failed';
      this.notifications.push(notification);
      return false;
    }
  }

  getHistory(userId: string): Notification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }

  private configureSes(options: NotificationServiceOptions): void {
    try {
      const clientConfig: Record<string, any> = {
        region: options.sesRegion,
      };

      if (options.sesAccessKeyId && options.sesSecretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: options.sesAccessKeyId,
          secretAccessKey: options.sesSecretAccessKey,
        };
      }

      this.sesClient = new SESv2Client(clientConfig);
      this.sesConfigurationSetName = options.sesConfigurationSetName;
      this.emailProvider = 'ses';
      logger.info('AWS SES email notifications enabled', {
        region: options.sesRegion,
      });
    } catch (error) {
      logger.error('Failed to configure AWS SES', { error });
    }
  }

  private configureSendgrid(apiKey: string): void {
    try {
      sgMail.setApiKey(apiKey);
      this.emailProvider = 'sendgrid';
      logger.info('SendGrid email notifications enabled');
    } catch (error) {
      logger.error('Failed to configure SendGrid', { error });
    }
  }

  private async sendEmail(
    notification: Notification,
    options: NotificationSendOptions
  ): Promise<void> {
    const to = options.to || notification.userId;
    const subject = options.subject || 'LLM Dev Project Update';
    const fromEmail =
      this.defaultFromEmail || process.env.DIGEST_SENDER_EMAIL || 'no-reply@example.com';
    const from = this.defaultFromName
      ? { email: fromEmail, name: this.defaultFromName }
      : fromEmail;

    if (this.emailProvider === 'ses' && this.sesClient) {
      await this.sendEmailWithSes(notification, {
        to,
        subject,
        html: options.html,
        fromEmail,
      });
      return;
    }

    if (this.emailProvider === 'sendgrid') {
      await this.sendEmailWithSendgrid(notification, {
        to,
        subject,
        from,
        html: options.html,
      });
      return;
    }

    logger.warn('No email provider configured. Falling back to console email.', {
      to,
      subject,
    });
    console.log(
      `\n📧 [EMAIL FALLBACK to ${to}]\nSubject: ${subject}\n\n${notification.message}\n`
    );
  }

  private async sendEmailWithSes(
    notification: Notification,
    opts: { to: string; subject: string; html?: string; fromEmail: string }
  ): Promise<void> {
    if (!this.sesClient) {
      throw new Error('SES client not configured');
    }

    const command = new SendEmailCommand({
      FromEmailAddress: opts.fromEmail,
      Destination: {
        ToAddresses: [opts.to],
      },
      Content: {
        Simple: {
          Subject: { Data: opts.subject },
          Body: {
            Text: { Data: notification.message },
            ...(opts.html ? { Html: { Data: opts.html } } : {}),
          },
        },
      },
      ConfigurationSetName: this.sesConfigurationSetName,
    });

    if (this.simulate) {
      logger.info('[SIMULATION] SES payload constructed', {
        to: opts.to,
        subject: opts.subject,
      });
      return;
    }

    await this.sesClient.send(command);
  }

  private async sendEmailWithSendgrid(
    notification: Notification,
    opts: { to: string; subject: string; from: string | { email: string; name: string }; html?: string }
  ): Promise<void> {
    const emailPayload = {
      to: opts.to,
      from: opts.from,
      subject: opts.subject,
      text: notification.message,
      html: opts.html || undefined,
    };

    if (this.simulate) {
      logger.info('[SIMULATION] SendGrid payload constructed', emailPayload);
      return;
    }

    await sgMail.send(emailPayload);
  }
}
