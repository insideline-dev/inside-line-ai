import { describe, it, expect } from 'bun:test';
import { QueueModule } from '../src/queue';
import { StorageModule } from '../src/storage';
import { EmailModule } from '../src/email';

/**
 * Basic integration tests to verify modules can be imported
 * Full e2e tests require actual DB/Redis/Storage connections
 *
 * These tests verify the boilerplate structure is set up correctly
 */
describe('App Integration (e2e)', () => {
  it('should export QueueModule', () => {
    expect(QueueModule).toBeDefined();
  });

  it('should export StorageModule', () => {
    expect(StorageModule).toBeDefined();
  });

  it('should export EmailModule', () => {
    expect(EmailModule).toBeDefined();
  });
});
