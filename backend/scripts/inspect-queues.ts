/**
 * Inspect and manage BullMQ queues
 *
 * Usage:
 *   bun run scripts/inspect-queues.ts list                    # List all queue jobs
 *   bun run scripts/inspect-queues.ts flush                   # Delete all jobs from all queues
 *   bun run scripts/inspect-queues.ts flush <queue-name>      # Delete jobs from specific queue
 *   bun run scripts/inspect-queues.ts info                    # Show queue statistics
 */
import 'dotenv/config';
import { Queue } from 'bullmq';
import { z } from 'zod';

const envSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

const env = envSchema.parse(process.env);

const QUEUE_NAMES = [
  'task',
  'ai-extraction',
  'ai-scraping',
  'ai-research',
  'ai-evaluation',
  'ai-synthesis',
];

async function getQueueStats(queue: Queue) {
  const counts = await queue.getJobCounts(
    'wait',
    'active',
    'completed',
    'failed',
    'delayed',
  );
  return counts;
}

async function listJobs() {
  console.log('\n📋 Queue Jobs Status:\n');

  for (const queueName of QUEUE_NAMES) {
    const queue = new Queue(queueName, { connection: env.REDIS_URL });
    const stats = await getQueueStats(queue);

    console.log(`Queue: ${queueName}`);
    console.log(`  Waiting:   ${stats.wait}`);
    console.log(`  Active:    ${stats.active}`);
    console.log(`  Completed: ${stats.completed}`);
    console.log(`  Failed:    ${stats.failed}`);
    console.log(`  Delayed:   ${stats.delayed}`);

    // Show details of waiting jobs
    if (stats.wait > 0) {
      const waitingJobs = await queue.getWaiting(0, 10);
      console.log(`  Waiting jobs (first 10):`);
      for (const job of waitingJobs) {
        console.log(`    - ID: ${job.id} | Data: ${JSON.stringify(job.data).substring(0, 100)}`);
      }
    }

    // Show details of active jobs
    if (stats.active > 0) {
      const activeJobs = await queue.getActive(0, 10);
      console.log(`  Active jobs (first 10):`);
      for (const job of activeJobs) {
        console.log(`    - ID: ${job.id} | Data: ${JSON.stringify(job.data).substring(0, 100)}`);
      }
    }

    // Show failed jobs
    if (stats.failed > 0) {
      const failedJobs = await queue.getFailed(0, 5);
      console.log(`  Failed jobs (first 5):`);
      for (const job of failedJobs) {
        console.log(`    - ID: ${job.id} | Error: ${job.failedReason}`);
      }
    }

    await queue.close();
    console.log('');
  }
}

async function flushQueues(targetQueue?: string) {
  const queuesToFlush = targetQueue ? [targetQueue] : QUEUE_NAMES;

  console.log(`\n🗑️  Flushing queues: ${queuesToFlush.join(', ')}\n`);

  for (const queueName of queuesToFlush) {
    const queue = new Queue(queueName, { connection: env.REDIS_URL });
    const before = await getQueueStats(queue);

    await queue.empty();
    console.log(`✅ Flushed ${queueName}`);
    console.log(`   Removed: ${before.wait} waiting + ${before.active} active + ${before.failed} failed jobs`);

    await queue.close();
  }

  console.log('\n✨ All queues flushed!\n');
}

async function showInfo() {
  console.log('\n📊 Queue Statistics:\n');

  let totalWaiting = 0,
    totalActive = 0,
    totalFailed = 0;

  for (const queueName of QUEUE_NAMES) {
    const queue = new Queue(queueName, { connection: env.REDIS_URL });
    const stats = await getQueueStats(queue);
    totalWaiting += stats.wait;
    totalActive += stats.active;
    totalFailed += stats.failed;
    await queue.close();
  }

  console.log(`Total Waiting:   ${totalWaiting}`);
  console.log(`Total Active:    ${totalActive}`);
  console.log(`Total Failed:    ${totalFailed}`);
  console.log(`Total All:       ${totalWaiting + totalActive + totalFailed}\n`);
}

async function main() {
  const command = process.argv[2] || 'list';
  const arg = process.argv[3];

  try {
    if (command === 'list') {
      await listJobs();
    } else if (command === 'flush') {
      if (arg && !QUEUE_NAMES.includes(arg)) {
        console.log(`❌ Unknown queue: ${arg}`);
        console.log(`Available queues: ${QUEUE_NAMES.join(', ')}`);
        process.exit(1);
      }
      await flushQueues(arg);
    } else if (command === 'info') {
      await showInfo();
    } else {
      console.log(`Unknown command: ${command}`);
      console.log('Usage:');
      console.log('  bun run scripts/inspect-queues.ts list               # List all queue jobs');
      console.log('  bun run scripts/inspect-queues.ts flush              # Delete all jobs');
      console.log('  bun run scripts/inspect-queues.ts flush <queue-name> # Delete jobs from queue');
      console.log('  bun run scripts/inspect-queues.ts info               # Show statistics');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
