import { DatabaseService, Headline } from './databaseService';
import {
  PersonalizationService,
  RecommendationResult,
} from './personalizationService';
import { logger } from '../utils/logger';

export interface DigestSectionItem {
  title: string;
  description?: string | null;
  url?: string | null;
  source?: string;
  publishedAt?: string;
  score?: number;
}

export interface DigestSection {
  title: string;
  items: DigestSectionItem[];
}

export interface DigestEmailPayload {
  userId: string;
  subject: string;
  previewText: string;
  textBody: string;
  htmlBody: string;
  sections: DigestSection[];
  generatedAt: string;
}

export interface DigestServiceOptions {
  headlineLimit?: number;
  personalizedLimit?: number;
}

export class DigestService {
  private databaseService: DatabaseService;
  private personalizationService?: PersonalizationService | null;
  private headlineLimit: number;
  private personalizedLimit: number;

  constructor(
    databaseService: DatabaseService,
    personalizationService?: PersonalizationService | null,
    options: DigestServiceOptions = {}
  ) {
    this.databaseService = databaseService;
    this.personalizationService = personalizationService;
    this.headlineLimit = options.headlineLimit ?? 5;
    this.personalizedLimit = options.personalizedLimit ?? 5;
  }

  async buildDailyDigest(userId: string): Promise<DigestEmailPayload> {
    logger.info('Building daily digest payload', {
      userId,
      headlineLimit: this.headlineLimit,
      personalizedLimit: this.personalizedLimit,
    });

    const topHeadlines = this.databaseService.getRecentHeadlines(
      this.headlineLimit
    );

    const personalizedArticles = await this.getPersonalizedArticles(userId);

    const sections: DigestSection[] = [];

    if (topHeadlines.length) {
      sections.push({
        title: 'Top Stories',
        items: topHeadlines.map(this.mapHeadlineToSectionItem),
      });
    }

    if (personalizedArticles.length) {
      sections.push({
        title: 'Recommended For You',
        items: personalizedArticles.map((article) => ({
          title: article.title,
          description: article.content,
          url: article.metadata?.url,
          source: article.metadata?.source,
          score: Number(article.score?.toFixed(2)),
        })),
      });
    }

    if (!sections.length) {
      sections.push({
        title: 'Latest Headlines',
        items: [
          {
            title:
              'We are gathering the latest stories for you. Check back shortly!',
            description:
              'Content will appear here once new headlines are available.',
          },
        ],
      });
    }

    const subject = this.buildSubjectLine(userId, personalizedArticles.length);
    const previewText =
      sections[0]?.items[0]?.title ??
      'Fresh insights and personalized news, curated just for you.';

    const htmlBody = this.renderHtmlDigest(sections);
    const textBody = this.renderTextDigest(sections);

    return {
      userId,
      subject,
      previewText,
      htmlBody,
      textBody,
      sections,
      generatedAt: new Date().toISOString(),
    };
  }

  private mapHeadlineToSectionItem(headline: Headline): DigestSectionItem {
    return {
      title: headline.title,
      description: headline.description,
      url: headline.url,
      source: headline.source,
      publishedAt: headline.publishedAt,
    };
  }

  private async getPersonalizedArticles(
    userId: string
  ): Promise<RecommendationResult[]> {
    if (!this.personalizationService) {
      logger.debug('Personalization service unavailable; skipping recommendations');
      return [];
    }

    try {
      return await this.personalizationService.getPersonalizedRecommendations(
        userId,
        this.personalizedLimit
      );
    } catch (error) {
      logger.warn('Failed to fetch personalized recommendations for digest', {
        userId,
        error,
      });
      return [];
    }
  }

  private buildSubjectLine(userId: string, recCount: number): string {
    const date = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    if (recCount > 0) {
      return `Your personalized news briefing • ${date}`;
    }

    return `Daily news highlights • ${date}`;
  }

  private renderHtmlDigest(sections: DigestSection[]): string {
    const sectionHtml = sections
      .map(
        (section) => `
      <section style="margin-bottom:24px;">
        <h2 style="font-size:18px;margin-bottom:8px;">${section.title}</h2>
        <ul style="padding-left:16px;margin:0;">
          ${section.items
            .map(
              (item) => `
            <li style="margin-bottom:12px;">
              <strong>${item.title}</strong><br/>
              ${item.description ? `<span>${item.description}</span><br/>` : ''}
              ${
                item.url
                  ? `<a href="${item.url}" target="_blank">Read more</a><br/>`
                  : ''
              }
              ${
                item.source
                  ? `<small>Source: ${item.source}${
                      item.publishedAt ? ` • ${item.publishedAt}` : ''
                    }</small>`
                  : ''
              }
            </li>`
            )
            .join('')}
        </ul>
      </section>`
      )
      .join('\n');

    return `
    <div style="font-family:Arial,sans-serif;color:#1f2933;">
      <h1 style="font-size:22px;margin-bottom:8px;">Daily Briefing</h1>
      <p style="margin-top:0;color:#4b5563;">
        Curated insights and headlines to keep you informed.
      </p>
      ${sectionHtml}
      <p style="font-size:12px;color:#9ca3af;">
        You are receiving this email because you subscribed to personalized updates.
      </p>
    </div>
    `;
  }

  private renderTextDigest(sections: DigestSection[]): string {
    const sectionText = sections
      .map((section) => {
        const items = section.items
          .map((item, idx) => {
            const lines = [`${idx + 1}. ${item.title}`];
            if (item.description) {
              lines.push(`   ${item.description}`);
            }
            if (item.url) {
              lines.push(`   ${item.url}`);
            }
            if (item.source) {
              lines.push(`   Source: ${item.source}`);
            }
            return lines.join('\n');
          })
          .join('\n');

        return `${section.title}\n${items}`;
      })
      .join('\n\n');

    return `Daily Briefing\n\n${sectionText}\n\nYou are receiving this update because you subscribed to personalized news digests.`;
  }
}




