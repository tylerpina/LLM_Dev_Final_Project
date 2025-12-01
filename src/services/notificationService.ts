import { logger } from '../utils/logger';

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: 'email' | 'push' | 'sms' | 'console';
  status: 'sent' | 'failed' | 'pending';
  timestamp: Date;
}

export class NotificationService {
  private notifications: Notification[] = [];

  constructor() {}

  async sendNotification(userId: string, message: string, type: 'email' | 'push' | 'sms' | 'console' = 'console'): Promise<boolean> {
    const notification: Notification = {
      id: Math.random().toString(36).substring(7),
      userId,
      message,
      type,
      status: 'pending',
      timestamp: new Date()
    };

    try {
      logger.info(`Preparing to send ${type} notification to user ${userId}`);
      
      // Simulate sending based on type
      switch (type) {
        case 'console':
          console.log(`\n🔔 [NOTIFICATION for ${userId}]:\n${message}\n`);
          break;
        case 'email':
          // Simulate email sending
          logger.info(`[SIMULATION] Sending email to ${userId}...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
        case 'push':
           // Simulate push notification
           logger.info(`[SIMULATION] Sending push notification to ${userId}...`);
           break;
      }

      notification.status = 'sent';
      this.notifications.push(notification);
      
      logger.info(`Notification ${notification.id} sent successfully`);
      return true;

    } catch (error) {
      logger.error(`Failed to send notification to ${userId}`, error);
      notification.status = 'failed';
      this.notifications.push(notification);
      return false;
    }
  }

  getHistory(userId: string): Notification[] {
    return this.notifications.filter(n => n.userId === userId);
  }
}
