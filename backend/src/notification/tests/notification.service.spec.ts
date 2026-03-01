import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { NotificationService } from '../notification.service';
import { DrizzleService } from '../../database';
import { notification, NotificationType } from '../entities';

describe('NotificationService', () => {
  let service: NotificationService;
  let drizzleService: ReturnType<typeof createMockDrizzle>;
  let gateway: { sendNotification: ReturnType<typeof jest.fn>; sendUnreadCount: ReturnType<typeof jest.fn> };

  const mockNotification = {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Test Notification',
    message: 'This is a test message',
    type: NotificationType.INFO,
    link: null,
    read: false,
    createdAt: new Date(),
  };

  const createMockDrizzle = () => {
    return {
      db: {
        select: jest.fn(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
        offset: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
      },
    };
  };

  beforeEach(async () => {
    drizzleService = createMockDrizzle();
    gateway = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
      sendUnreadCount: jest.fn().mockResolvedValue(undefined),
    };

    // Default behavior for select
    drizzleService.db.select.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: DrizzleService, useValue: drizzleService },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn().mockReturnValue(gateway),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ CREATE TESTS ============

  describe('create', () => {
    it('should create a notification with all fields', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockNotification]);

      const result = await service.create(
        'user-1',
        'Test Notification',
        'This is a test message',
        NotificationType.INFO,
        'https://example.com',
      );

      expect(result).toEqual(mockNotification);
      expect(drizzleService.db.insert).toHaveBeenCalledWith(notification);
      expect(drizzleService.db.values).toHaveBeenCalledWith({
        userId: 'user-1',
        title: 'Test Notification',
        message: 'This is a test message',
        type: NotificationType.INFO,
        link: 'https://example.com',
      });
    });

    it('should create notification without link', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockNotification]);

      const result = await service.create(
        'user-1',
        'Test',
        'Message',
        NotificationType.SUCCESS,
      );

      expect(result).toBeDefined();
      expect(drizzleService.db.values).toHaveBeenCalledWith({
        userId: 'user-1',
        title: 'Test',
        message: 'Message',
        type: NotificationType.SUCCESS,
        link: undefined,
      });
    });

    it('should default to INFO type', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockNotification]);

      await service.create('user-1', 'Test', 'Message');

      expect(drizzleService.db.values).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.INFO }),
      );
    });
  });

  describe('createAndBroadcast', () => {
    it('creates notification and emits realtime payload + unread count', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockNotification]);
      const unreadSpy = jest
        .spyOn(service, 'getUnreadCount')
        .mockResolvedValue(3);

      const result = await service.createAndBroadcast(
        'user-1',
        'Pipeline complete',
        'Analysis completed',
        NotificationType.SUCCESS,
        '/admin/startup/startup-1',
      );

      expect(result).toEqual(mockNotification);
      expect(gateway.sendNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          id: 'notif-1',
          title: 'Test Notification',
        }),
      );
      expect(unreadSpy).toHaveBeenCalledWith('user-1');
      expect(gateway.sendUnreadCount).toHaveBeenCalledWith('user-1', 3);
    });
  });

  // ============ BULK CREATE TESTS ============

  describe('createBulk', () => {
    it('should create multiple notifications', async () => {
      const notifications = [
        {
          userId: 'user-1',
          title: 'Notification 1',
          message: 'Message 1',
          type: NotificationType.INFO,
        },
        {
          userId: 'user-2',
          title: 'Notification 2',
          message: 'Message 2',
          type: NotificationType.SUCCESS,
        },
      ];

      drizzleService.db.returning.mockResolvedValueOnce([
        { ...mockNotification, ...notifications[0] },
        { ...mockNotification, ...notifications[1] },
      ]);

      const result = await service.createBulk(notifications);

      expect(result).toHaveLength(2);
      expect(drizzleService.db.insert).toHaveBeenCalledWith(notification);
      expect(drizzleService.db.values).toHaveBeenCalledWith(notifications);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.createBulk([]);

      expect(result).toEqual([]);
      expect(drizzleService.db.insert).not.toHaveBeenCalled();
    });
  });

  // ============ FIND ALL TESTS ============

  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      const mockData = [mockNotification, { ...mockNotification, id: 'notif-2' }];

      // Mock getUnreadCount since it's called internally
      jest.spyOn(service, 'getUnreadCount').mockResolvedValue(2);

      // First select() call is for count, second is for data
      drizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ count: 2 }]),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue(mockData),
        });

      const result = await service.findAll('user-1', {
        page: 1,
        limit: 20,
        read: undefined,
      });

      expect(result.data).toEqual(mockData);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by read status', async () => {
      const whereChain = jest.fn().mockResolvedValue([{ count: 1 }]);
      drizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: whereChain,
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue([mockNotification]),
        });

      await service.findAll('user-1', { page: 1, limit: 20, read: false });

      expect(whereChain).toHaveBeenCalled();
    });

    it('should calculate pagination correctly', async () => {
      drizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ count: 50 }]),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue([mockNotification]),
        });

      const result = await service.findAll('user-1', { page: 2, limit: 20, read: undefined });

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 50,
        totalPages: 3,
      });
    });

    it('should order by read status and date', async () => {
      const orderByChain = jest.fn().mockReturnThis();
      drizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ count: 1 }]),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: orderByChain,
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue([mockNotification]),
        });

      await service.findAll('user-1', { page: 1, limit: 20, read: undefined });

      expect(orderByChain).toHaveBeenCalled();
    });
  });

  // ============ MARK READ TESTS ============

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      const updated = { ...mockNotification, read: true };
      drizzleService.db.returning.mockResolvedValueOnce([updated]);

      const result = await service.markRead('notif-1', 'user-1');

      expect(result.read).toBe(true);
      expect(drizzleService.db.update).toHaveBeenCalledWith(notification);
      expect(drizzleService.db.set).toHaveBeenCalledWith({ read: true });
    });

    it('should throw NotFoundException if notification not found', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      await expect(service.markRead('notif-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should respect RLS (userId filter)', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([mockNotification]);

      await service.markRead('notif-1', 'user-1');

      expect(drizzleService.db.where).toHaveBeenCalled();
    });
  });

  // ============ DELETE TESTS ============

  describe('delete', () => {
    it('should delete notification', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([{ id: 'notif-1' }]);

      await service.delete('notif-1', 'user-1');

      expect(drizzleService.db.delete).toHaveBeenCalledWith(notification);
    });

    it('should throw NotFoundException if notification not found', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([]);

      await expect(service.delete('notif-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should respect RLS (userId filter)', async () => {
      drizzleService.db.returning.mockResolvedValueOnce([{ id: 'notif-1' }]);

      await service.delete('notif-1', 'user-1');

      expect(drizzleService.db.where).toHaveBeenCalled();
    });
  });

  // ============ UNREAD COUNT TESTS ============

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      const whereChain = jest.fn().mockResolvedValue([{ count: 5 }]);
      drizzleService.db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: whereChain,
      });

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(5);
      expect(whereChain).toHaveBeenCalled();
    });

    it('should return 0 if no unread notifications', async () => {
      drizzleService.db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: 0 }]),
      });

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(0);
    });
  });
});
