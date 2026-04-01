/**
 * eval/run_eval.js
 * Standalone evaluation runner for CI/CD pipelines.
 * Exits with code 1 if overall score is below threshold.
 *
 * Usage: node eval/run_eval.js
 */

import 'dotenv/config';
import { runEvaluation } from '../lib/evaluator.js';
import fs from 'fs';
import path from 'path';

const PASS_THRESHOLD = 0.8;
const REPORT_PATH = 'eval/last_report.json';

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║      Ask My Docs — RAG Evaluation Runner         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  try {
    const { results, averages, passed } = await runEvaluation('eval/dataset.json');

    // Save report to disk
    const report = {
      timestamp: new Date().toISOString(),
      threshold: PASS_THRESHOLD,
      passed,
      averages,
      sampleCount: results.length,
      results,
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[Eval] Report saved to: ${REPORT_PATH}`);

    // Exit with appropriate code for CI
    if (!passed) {
      console.error(`\n❌ Evaluation FAILED. Overall score ${(averages.overall * 100).toFixed(1)}% is below threshold ${PASS_THRESHOLD * 100}%`);
      process.exit(1);
    } else {
      console.log(`\n✅ Evaluation PASSED. Overall score: ${(averages.overall * 100).toFixed(1)}%`);
      process.exit(0);
    }
  } catch (err) {
    console.error('[Eval] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
