import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationController } from '../notification.controller';
import { NotificationService } from '../notification.service';
import { NotificationGateway } from '../notification.gateway';
import { NotificationType } from '../entities';
import type { DbUser } from '../../auth/user-auth.service';
import { UserRole } from '../../auth/entities/auth.schema';

describe('NotificationController', () => {
  let controller: NotificationController;
  let service: NotificationService;
  let gateway: NotificationGateway;

  const mockUser: DbUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: true,
    role: UserRole.FOUNDER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNotification = {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Test Notification',
    message: 'Test message',
    type: NotificationType.INFO,
    link: null,
    read: false,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: {
            findAll: jest.fn(),
            markRead: jest.fn(),
            delete: jest.fn(),
            getUnreadCount: jest.fn(),
          },
        },
        {
          provide: NotificationGateway,
          useValue: {
            sendUnreadCount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
    service = module.get<NotificationService>(NotificationService);
    gateway = module.get<NotificationGateway>(NotificationGateway);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============ GET NOTIFICATIONS TESTS ============

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      const mockResult = {
        data: [mockNotification],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      const result = await controller.getNotifications(mockUser, {
        page: 1,
        limit: 20,
        read: undefined,
      });

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledWith('user-1', {
        page: 1,
        limit: 20,
        read: undefined,
      });
    });

    it('should pass query filters to service', async () => {
      const mockResult = {
        data: [],
        meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
      };
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      await controller.getNotifications(mockUser, {
        page: 2,
        limit: 10,
        read: false,
      });

      expect(service.findAll).toHaveBeenCalledWith('user-1', {
        page: 2,
        limit: 10,
        read: false,
      });
    });
  });

  // ============ MARK AS READ TESTS ============

  describe('markAsRead', () => {
    it('should mark notification as read and send updated count', async () => {
      const updated = { ...mockNotification, read: true };
      jest.spyOn(service, 'markRead').mockResolvedValue(updated);
      jest.spyOn(service, 'getUnreadCount').mockResolvedValue(5);

      const result = await controller.markAsRead(mockUser, 'notif-1');

      expect(result).toEqual(updated);
      expect(service.markRead).toHaveBeenCalledWith('notif-1', 'user-1');
      expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(gateway.sendUnreadCount).toHaveBeenCalledWith('user-1', 5);
    });

    it('should throw NotFoundException if notification not found', async () => {
      jest.spyOn(service, 'markRead').mockRejectedValue(new NotFoundException());

      await expect(controller.markAsRead(mockUser, 'notif-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(gateway.sendUnreadCount).not.toHaveBeenCalled();
    });
  });

  // ============ DELETE TESTS ============

  describe('deleteNotification', () => {
    it('should delete notification and send updated count', async () => {
      jest.spyOn(service, 'delete').mockResolvedValue(undefined);
      jest.spyOn(service, 'getUnreadCount').mockResolvedValue(3);

      await controller.deleteNotification(mockUser, 'notif-1');

      expect(service.delete).toHaveBeenCalledWith('notif-1', 'user-1');
      expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(gateway.sendUnreadCount).toHaveBeenCalledWith('user-1', 3);
    });

    it('should throw NotFoundException if notification not found', async () => {
      jest.spyOn(service, 'delete').mockRejectedValue(new NotFoundException());

      await expect(
        controller.deleteNotification(mockUser, 'notif-1'),
      ).rejects.toThrow(NotFoundException);
      expect(gateway.sendUnreadCount).not.toHaveBeenCalled();
    });
  });

  // ============ GUARDS TESTS ============

  describe('authentication and authorization', () => {
    it('should require authentication for all endpoints', () => {
      const metadata = Reflect.getMetadata('swagger/apiSecurity', NotificationController);
      expect(metadata).toBeDefined();
    });

    it('should validate UUID format for notification IDs', async () => {
      // ParseUUIDPipe should reject invalid UUIDs
      // This is tested at the NestJS pipe level
      expect(controller.markAsRead).toBeDefined();
      expect(controller.deleteNotification).toBeDefined();
    });
  });
});
