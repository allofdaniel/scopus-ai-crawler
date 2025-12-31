import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import pLimit from 'p-limit';

export interface RateLimiterOptions {
  requestsPerSecond: number;
}

export abstract class BaseApiClient {
  protected client: AxiosInstance;
  protected limiter: ReturnType<typeof pLimit>;
  protected requestsPerSecond: number;

  constructor(baseURL: string, options: RateLimiterOptions, headers?: Record<string, string>) {
    this.requestsPerSecond = options.requestsPerSecond;
    this.limiter = pLimit(options.requestsPerSecond);

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        ...headers,
      },
    });

    // Add delay between requests to respect rate limits
    this.client.interceptors.response.use(
      async (response) => {
        await this.delay(1000 / this.requestsPerSecond);
        return response;
      },
      async (error) => {
        if (error.response?.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(error.response.headers['retry-after'] || '5', 10);
          console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
          await this.delay(retryAfter * 1000);
          return this.client.request(error.config);
        }
        throw error;
      }
    );
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async request<T>(config: AxiosRequestConfig): Promise<T> {
    return this.limiter(async () => {
      const response = await this.client.request<T>(config);
      return response.data;
    });
  }
}
