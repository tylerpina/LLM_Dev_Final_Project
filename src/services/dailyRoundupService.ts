import * as cron from 'node-cron';
import { MultiAgentOrchestrator } from '../agents/orchestrator';
import { NotificationService } from './notificationService';
import { logger } from '../utils/logger';

export class DailyRoundupService {
  private orchestrator: MultiAgentOrchestrator;
  private notificationService: NotificationService;
  private cronJob?: ReturnType<typeof cron.schedule>;

  constructor(
    orchestrator: MultiAgentOrchestrator,
    notificationService: NotificationService
  ) {
    this.orchestrator = orchestrator;
    this.notificationService = notificationService;
  }

  startScheduler(cronExpression: string = '0 9 * * *') { // Default: 9 AM daily
    logger.info('Starting Daily Roundup Scheduler', { schedule: cronExpression });
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      logger.info('Triggering scheduled Daily Roundup');
      await this.generateAndSendRoundup();
    });
  }

  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Daily Roundup Scheduler stopped');
    }
  }

  async generateAndSendRoundup(userId: string = 'default_user') {
    try {
      logger.info('Generating Daily Roundup', { userId });

      // 1. Generate content using the MultiAgentOrchestrator
      // We ask for a comprehensive daily briefing
      const query = "Generate a comprehensive daily news roundup summarizing the most important headlines, trends, and sentiments from today. Focus on key global events and technology news.";
      
      const result = await this.orchestrator.processQuery(query, userId);
      const summary = result.synthesizedResponse;

      // 2. Format the notification message
      const message = `
🌟 YOUR DAILY NEWS ROUNDUP 🌟
${new Date().toLocaleDateString()}

${summary}

-------------------------------------------
Read more in the app!
`;

      // 3. Send notification
      await this.notificationService.sendNotification(userId, message, 'console');
      
      logger.info('Daily Roundup sent successfully', { userId });
      return { success: true, message };

    } catch (error) {
      logger.error('Failed to generate/send Daily Roundup', error);
      return { success: false, error };
    }
  }
}

