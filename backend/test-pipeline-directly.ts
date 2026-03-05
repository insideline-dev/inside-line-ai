import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PipelineService } from './src/modules/ai/services/pipeline.service';
import { StartupService } from './src/modules/startup/startup.service';

async function test() {
  console.log('🚀 Starting direct pipeline test...');

  const app = await NestFactory.create(AppModule);
  const pipelineService = app.get(PipelineService);
  const startupService = app.get(StartupService);

  try {
    // Create a test startup
    console.log('\n📝 Creating test startup...');
    const startup = await startupService.create({
      userId: 'test-user-123',
      name: 'TestCo Pipeline Direct',
      website: 'https://testco.com',
      stage: 'seed',
      industry: 'AI',
      location: 'San Francisco',
      description: 'Direct pipeline test',
    });
    console.log('✅ Startup created:', startup.id);

    // Start pipeline
    console.log('\n▶️  Starting pipeline...');
    const runId = await pipelineService.startPipeline(startup.id, 'test-user-123');
    console.log('✅ Pipeline started:', runId);

    // Wait and check status
    console.log('\n⏳ Waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('\n🔍 Checking pipeline status...');
    const status = await pipelineService.getPipelineStatus(startup.id);
    console.log('Pipeline status:', status?.status);
    if (status?.status === 'cancelled') {
      console.log('❌ PIPELINE WAS CANCELLED!');
      console.log('Current phase:', status.currentPhase);
    } else {
      console.log('✅ Pipeline still running');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

test();
