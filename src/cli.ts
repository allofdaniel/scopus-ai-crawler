#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';
import { AcademicCrawler, CrawlerConfig } from './crawler/full-crawler';

// Load environment variables
dotenv.config();

// CLI Interface
async function askQuestion(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       SCOPUS AI CRAWLER - Academic Paper Discovery         ║');
  console.log('║          AI-Powered Research Paper Analysis Tool           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Check for Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️  Warning: GEMINI_API_KEY not set. AI analysis will be disabled.');
    console.log('   Set it in .env file or environment variable.\n');
  } else {
    console.log('✅ Gemini API key found\n');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Get configuration from user
    console.log('Please provide your research parameters:\n');

    const keywordsInput = await askQuestion(
      rl,
      '📚 Enter search keywords (comma-separated)',
      'machine learning, aviation safety'
    );
    const keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k);

    const context = await askQuestion(
      rl,
      '🎯 Research context/goal',
      'Investigating machine learning applications in aviation safety systems'
    );

    const maxDepthInput = await askQuestion(
      rl,
      '🔗 Reference follow depth (0-3)',
      '1'
    );
    const maxDepth = Math.min(3, Math.max(0, parseInt(maxDepthInput) || 1));

    const papersPerSourceInput = await askQuestion(
      rl,
      '📊 Papers per source (5-50)',
      '20'
    );
    const papersPerSource = Math.min(50, Math.max(5, parseInt(papersPerSourceInput) || 20));

    const downloadPdfsInput = await askQuestion(
      rl,
      '📥 Download PDFs? (y/n)',
      'y'
    );
    const downloadPdfs = downloadPdfsInput.toLowerCase().startsWith('y');

    const outputDir = await askQuestion(
      rl,
      '📁 Output directory',
      path.join(process.cwd(), 'crawler-output')
    );

    rl.close();

    // Confirm
    console.log('\n────────────────────────────────────────');
    console.log('Configuration Summary:');
    console.log('────────────────────────────────────────');
    console.log(`  Keywords: ${keywords.join(', ')}`);
    console.log(`  Context: ${context}`);
    console.log(`  Max Depth: ${maxDepth}`);
    console.log(`  Papers/Source: ${papersPerSource}`);
    console.log(`  Download PDFs: ${downloadPdfs}`);
    console.log(`  Output: ${outputDir}`);
    console.log('────────────────────────────────────────\n');

    // Create config
    const config: CrawlerConfig = {
      keywords,
      context,
      maxDepth,
      papersPerSource,
      downloadPdfs,
      outputDir,
    };

    // Run crawler
    const crawler = new AcademicCrawler(config);
    await crawler.crawl();

    console.log('\n✅ Crawling complete!');
    console.log(`\nOutput files:`);
    console.log(`  📄 ${path.join(outputDir, 'research-summary.md')}`);
    console.log(`  📊 ${path.join(outputDir, 'research-export.json')}`);
    console.log(`  💾 ${path.join(outputDir, 'crawler-db.json')}`);
    if (downloadPdfs) {
      console.log(`  📁 ${path.join(outputDir, 'pdfs/')}`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
main().catch(console.error);
