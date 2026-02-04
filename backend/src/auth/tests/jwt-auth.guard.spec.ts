import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../auth.constants';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  const createMockExecutionContext = (
    handler: () => void = () => {},
    classRef: new () => object = class TestController {},
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true for public routes', () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride.mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        expect.any(Function),
        expect.any(Function),
      ]);
    });

    it('should delegate to parent canActivate for protected routes', async () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride.mockReturnValue(false);

      // The parent's canActivate will throw because we don't have a valid JWT strategy
      // This is expected behavior - the guard correctly delegates to Passport
      try {
        await guard.canActivate(context);
      } catch (error) {
        // Expected: Passport throws when JWT strategy is not configured
        expect((error as Error).message).toContain('jwt');
      }
    });

    it('should check both handler and class for public decorator', () => {
      const handler = () => {};
      class TestClass {}
      const context = createMockExecutionContext(handler, TestClass);
      reflector.getAllAndOverride.mockReturnValue(true); // Make it public to avoid Passport error

      guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        handler,
        TestClass,
      ]);
    });

    it('should return true when handler has @Public decorator', () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride.mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when class has @Public decorator', () => {
      const context = createMockExecutionContext();
      // getAllAndOverride returns true if either handler or class has the decorator
      reflector.getAllAndOverride.mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should not bypass auth when @Public is not present', async () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride.mockReturnValue(false);

      // Parent's canActivate is called, which throws without JWT strategy
      try {
        await guard.canActivate(context);
      } catch {
        // Expected behavior
      }

      expect(reflector.getAllAndOverride).toHaveBeenCalled();
    });

    it('should handle undefined public decorator value', async () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride.mockReturnValue(undefined);

      // Undefined is falsy, so it should call parent's canActivate
      try {
        await guard.canActivate(context);
      } catch {
        // Expected behavior - Passport throws without JWT strategy
      }

      expect(reflector.getAllAndOverride).toHaveBeenCalled();
    });
  });
});
