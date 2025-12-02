import { NewsApiService } from './newsApiService';
import { GuardianApiService } from './guardianApiService';
import { ArxivApiService } from './arxivApiService';
import { NYTimesApiService } from './nytimesApiService';
import { OpenAlexApiService } from './openAlexApiService';

export interface ApiProvider {
  name: string;
  service: NewsApiService | GuardianApiService | ArxivApiService | NYTimesApiService | OpenAlexApiService;
  endpoints: string[];
}

export class ApiRegistry {
  private providers: Map<string, ApiProvider> = new Map();

  register(provider: ApiProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): ApiProvider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): ApiProvider[] {
    return Array.from(this.providers.values());
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Factory function to create providers
export function createNewsApiProvider(apiKey: string): ApiProvider {
  return {
    name: 'newsapi',
    service: new NewsApiService(apiKey),
    endpoints: ['/news/top-headlines']
  };
}

export function createGuardianProvider(apiKey: string): ApiProvider {
  return {
    name: 'guardian',
    service: new GuardianApiService(apiKey),
    endpoints: ['/guardian/search', '/guardian/sections']
  };
}

export function createArxivProvider(): ApiProvider {
  return {
    name: 'arxiv',
    service: new ArxivApiService(),
    endpoints: ['/arxiv/search', '/arxiv/paper', '/arxiv/category']
  };
}

export function createNYTimesProvider(apiKey: string): ApiProvider {
  return {
    name: 'nytimes',
    service: new NYTimesApiService(apiKey),
    endpoints: ['/nytimes/search', '/nytimes/archive']
  };
}

export function createOpenAlexProvider(contactEmail?: string): ApiProvider {
  return {
    name: 'openalex',
    service: new OpenAlexApiService(contactEmail),
    endpoints: ['/openalex/works', '/openalex/work']
  };
}
