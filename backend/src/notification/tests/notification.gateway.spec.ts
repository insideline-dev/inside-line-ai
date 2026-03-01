import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationGateway } from '../notification.gateway';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../entities';
import type { Socket, Server } from 'socket.io';

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let jwtService: JwtService;
  let notificationService: NotificationService;

  const createMockSocket = (token?: string): Partial<Socket> => ({
    id: 'socket-1',
    handshake: {
      auth: { token },
      headers: {},
    } as unknown as Socket['handshake'],
    data: {},
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  const createMockServer = () => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGateway,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            getUnreadCount: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
    jwtService = module.get<JwtService>(JwtService);
    notificationService = module.get<NotificationService>(NotificationService);

    gateway.server = createMockServer() as unknown as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  // ============ CONNECTION TESTS ============

  describe('handleConnection', () => {
    it('should accept connection with valid JWT', async () => {
      const mockSocket = createMockSocket('valid-token') as Socket;
      const mockPayload = { sub: 'user-1', email: 'test@example.com' };

      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      jest.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(5);

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(mockSocket.data.userId).toBe('user-1');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-1');
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith('user-1');
    });

    it('should accept token from authorization header', async () => {
      const mockSocket = {
        id: 'socket-1',
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
        } as unknown as Socket['handshake'],
        data: {},
        join: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      const mockPayload = { sub: 'user-1', email: 'test@example.com' };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      jest.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(0);

      await gateway.handleConnection(mockSocket);

      expect(jwtService.verify).toHaveBeenCalledWith('header-token');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-1');
    });

    it('should disconnect client with no token', async () => {
      const mockSocket = createMockSocket() as Socket;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('should disconnect client with invalid token', async () => {
      const mockSocket = createMockSocket('invalid-token') as Socket;
      jest
        .spyOn(jwtService, 'verify')
        .mockImplementation(() => {
          throw new UnauthorizedException('Invalid token');
        });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should send unread count on connection', async () => {
      const mockSocket = createMockSocket('valid-token') as Socket;
      const mockPayload = { sub: 'user-1', email: 'test@example.com' };

      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      jest.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(10);
      jest.spyOn(gateway, 'sendUnreadCount');

      await gateway.handleConnection(mockSocket);

      expect(gateway.sendUnreadCount).toHaveBeenCalledWith('user-1', 10);
    });
  });

  // ============ DISCONNECTION TESTS ============

  describe('handleDisconnect', () => {
    it('should handle disconnect with userId', () => {
      const mockSocket = { id: 'socket-1', data: { userId: 'user-1' } } as Socket;

      // Should not throw
      gateway.handleDisconnect(mockSocket);

      expect(mockSocket.data.userId).toBe('user-1');
    });

    it('should handle disconnect without userId', () => {
      const mockSocket = { id: 'socket-1', data: {} } as Socket;

      // Should not throw
      gateway.handleDisconnect(mockSocket);
    });
  });

  // ============ SEND NOTIFICATION TESTS ============

  describe('sendNotification', () => {
    it('should send notification to specific user room', async () => {
      const notification = {
        id: 'notif-1',
        title: 'Test Notification',
        message: 'Test message',
        type: NotificationType.INFO,
        link: null,
      };

      await gateway.sendNotification('user-1', notification);

      expect(gateway.server.to).toHaveBeenCalledWith('user:user-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('notification:new', notification);
    });

    it('should handle notification with link', async () => {
      const notification = {
        id: 'notif-1',
        title: 'Test',
        message: 'Message',
        type: NotificationType.SUCCESS,
        link: 'https://example.com',
      };

      await gateway.sendNotification('user-1', notification);

      expect(gateway.server.emit).toHaveBeenCalledWith('notification:new', notification);
    });
  });

  // ============ SEND UNREAD COUNT TESTS ============

  describe('sendUnreadCount', () => {
    it('should send unread count to specific user', async () => {
      await gateway.sendUnreadCount('user-1', 5);

      expect(gateway.server.to).toHaveBeenCalledWith('user:user-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('notification:count', {
        count: 5,
      });
    });

    it('should send zero count', async () => {
      await gateway.sendUnreadCount('user-1', 0);

      expect(gateway.server.emit).toHaveBeenCalledWith('notification:count', {
        count: 0,
      });
    });
  });

  // ============ MULTIPLE CLIENTS TESTS ============

  describe('multiple clients for same user', () => {
    it('should allow multiple clients to join same user room', async () => {
      const mockSocket1 = createMockSocket('token1') as Socket;
      const mockSocket2 = createMockSocket('token2') as Socket;
      const mockPayload = { sub: 'user-1', email: 'test@example.com' };

      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      jest.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(3);

      await gateway.handleConnection(mockSocket1);
      await gateway.handleConnection(mockSocket2);

      expect(mockSocket1.join).toHaveBeenCalledWith('user:user-1');
      expect(mockSocket2.join).toHaveBeenCalledWith('user:user-1');
    });

    it('should send notification to all clients in user room', async () => {
      const notification = {
        id: 'notif-1',
        title: 'Test',
        message: 'Message',
        type: NotificationType.INFO,
        link: null,
      };

      await gateway.sendNotification('user-1', notification);

      // All clients in 'user:user-1' room should receive the notification
      expect(gateway.server.to).toHaveBeenCalledWith('user:user-1');
    });
  });
});
