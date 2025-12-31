#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { AcademicCrawler, CrawlerConfig } from './crawler/full-crawler';

dotenv.config();

interface SchedulerConfig {
  jobs: CrawlerConfig[];
  intervalHours: number;
  maxRuns?: number;
}

// Load scheduler config
function loadSchedulerConfig(): SchedulerConfig {
  const configPath = path.join(process.cwd(), 'scheduler-config.json');

  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Default config
  const defaultConfig: SchedulerConfig = {
    intervalHours: 24,
    jobs: [
      {
        keywords: ['machine learning', 'aviation safety'],
        context: 'Machine learning applications in aviation safety and maintenance',
        maxDepth: 1,
        papersPerSource: 20,
        downloadPdfs: true,
        outputDir: path.join(process.cwd(), 'crawler-output', 'aviation-ml'),
      },
    ],
  };

  // Save default config
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created default config: ${configPath}`);

  return defaultConfig;
}

async function runJob(config: CrawlerConfig, jobIndex: number): Promise<void> {
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`  JOB ${jobIndex + 1}: ${config.keywords.join(', ')}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const crawler = new AcademicCrawler(config);
    await crawler.crawl();
    console.log(`\n✅ Job ${jobIndex + 1} completed successfully`);
  } catch (error: any) {
    console.error(`\n❌ Job ${jobIndex + 1} failed: ${error.message}`);
  }
}

async function runAllJobs(config: SchedulerConfig): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          SCOPUS AI CRAWLER - SCHEDULED RUN                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTime: ${new Date().toISOString()}`);
  console.log(`Jobs to run: ${config.jobs.length}`);

  for (let i = 0; i < config.jobs.length; i++) {
    await runJob(config.jobs[i], i);
  }

  console.log('\n════════════════════════════════════════');
  console.log('  ALL JOBS COMPLETED');
  console.log('════════════════════════════════════════\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');
  const runDaemon = args.includes('--daemon');

  const config = loadSchedulerConfig();

  if (runOnce) {
    // Single run
    console.log('Running once...');
    await runAllJobs(config);
    return;
  }

  if (runDaemon) {
    // Continuous scheduled runs
    console.log(`\n🕐 Starting scheduler (interval: ${config.intervalHours}h)`);
    console.log('   Press Ctrl+C to stop\n');

    let runCount = 0;

    const run = async () => {
      runCount++;

      if (config.maxRuns && runCount > config.maxRuns) {
        console.log(`\nMax runs (${config.maxRuns}) reached. Stopping.`);
        process.exit(0);
      }

      console.log(`\n[Run ${runCount}] Starting at ${new Date().toISOString()}`);
      await runAllJobs(config);

      const nextRun = new Date(Date.now() + config.intervalHours * 60 * 60 * 1000);
      console.log(`\n⏰ Next run scheduled for: ${nextRun.toISOString()}`);
    };

    // First run immediately
    await run();

    // Schedule subsequent runs
    setInterval(run, config.intervalHours * 60 * 60 * 1000);

    // Keep process alive
    process.stdin.resume();
  } else {
    // Show help
    console.log('Scopus AI Crawler - Scheduler');
    console.log('');
    console.log('Usage:');
    console.log('  npx ts-node src/scheduler.ts --once     Run all jobs once');
    console.log('  npx ts-node src/scheduler.ts --daemon   Run continuously on schedule');
    console.log('');
    console.log('Configuration: scheduler-config.json');
    console.log('');

    // Run once as default
    console.log('Running jobs once (default)...\n');
    await runAllJobs(config);
  }
}

main().catch(console.error);
