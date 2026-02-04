# Notification Module

Real-time notification system with WebSocket support for the Inside Line platform.

## Features

- REST endpoints for notification CRUD operations
- Real-time WebSocket delivery
- JWT authentication for WebSocket connections
- Paginated notification lists
- Read/unread status tracking
- RLS (Row-Level Security) for data isolation

## REST API

### Get Notifications

```http
GET /notifications?page=1&limit=20&read=false
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 20, max: 100) - Items per page
- `read` (optional) - Filter by read status ("true" or "false")

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "New Match Found",
      "message": "You have a new investor match!",
      "type": "info",
      "link": "/matches/123",
      "read": false,
      "createdAt": "2026-02-04T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### Mark Notification as Read

```http
PATCH /notifications/:id/read
Authorization: Bearer <token>
```

**Response:** Updated notification object

### Delete Notification

```http
DELETE /notifications/:id
Authorization: Bearer <token>
```

**Response:** 204 No Content

## WebSocket API

### Connection

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/notifications', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Or via Authorization header
const socket = io('http://localhost:3000/notifications', {
  extraHeaders: {
    Authorization: 'Bearer your-jwt-token'
  }
});
```

### Events

#### `notification:new` (Server → Client)

Emitted when a new notification is created for the user.

```typescript
socket.on('notification:new', (data) => {
  console.log('New notification:', data);
  // {
  //   id: "uuid",
  //   title: "Startup Approved",
  //   message: "Your startup has been approved!",
  //   type: "success",
  //   link: "/dashboard"
  // }
});
```

#### `notification:count` (Server → Client)

Emitted on connection and after read/delete operations.

```typescript
socket.on('notification:count', ({ count }) => {
  console.log('Unread notifications:', count);
  // Update UI badge
});
```

## Notification Types

- `info` - General updates (new match, new message)
- `success` - Positive actions (approved, accepted)
- `warning` - Attention needed (low score, missing info)
- `error` - Rejections, failures

## Integration Examples

### Creating Notifications (Internal)

```typescript
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { NotificationType } from '../notification/entities';

@Injectable()
export class StartupService {
  constructor(
    private notificationService: NotificationService,
    private notificationGateway: NotificationGateway,
  ) {}

  async approveStartup(startupId: string, userId: string) {
    // ... approval logic ...

    // Create notification
    const notification = await this.notificationService.create(
      userId,
      'Startup Approved',
      'Your startup has been approved and is now live!',
      NotificationType.SUCCESS,
      `/startups/${startupId}`
    );

    // Broadcast via WebSocket
    await this.notificationGateway.sendNotification(userId, notification);

    // Update unread count
    const count = await this.notificationService.getUnreadCount(userId);
    await this.notificationGateway.sendUnreadCount(userId, count);
  }
}
```

### Bulk Notifications

```typescript
const notifications = users.map(user => ({
  userId: user.id,
  title: 'System Update',
  message: 'A new feature has been released!',
  type: NotificationType.INFO,
}));

await this.notificationService.createBulk(notifications);

// Broadcast to all users
for (const notif of notifications) {
  await this.notificationGateway.sendNotification(notif.userId, notif);
}
```

## Frontend Example (React)

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useNotifications(token: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const newSocket = io('http://localhost:3000/notifications', {
      auth: { token }
    });

    newSocket.on('notification:new', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      // Show toast notification
    });

    newSocket.on('notification:count', ({ count }) => {
      setUnreadCount(count);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  const markAsRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
  };

  return { notifications, unreadCount, markAsRead };
}
```

## Rate Limiting

- REST endpoints: 100 requests/minute per user
- WebSocket connections: 10 concurrent per user

## Database Schema

See `src/notification/entities/notification.schema.ts` for the full schema with RLS policies.

## Testing

```bash
# Run all notification tests
bun test notification

# Run specific test files
bun test notification.service.spec.ts
bun test notification.gateway.spec.ts
bun test notification.controller.spec.ts
```

## Production Considerations

For multi-instance deployments, configure Redis adapter for WebSocket scaling:

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

// In main.ts
const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

app.useWebSocketAdapter(new IoAdapter(app));
// Configure adapter with redis clients
```
