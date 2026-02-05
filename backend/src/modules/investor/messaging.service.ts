import { Injectable } from '@nestjs/common';

// AI_PLACEHOLDER
@Injectable()
export class MessagingService {
  async getConversations() {
    return { data: [], message: 'AI messaging feature coming soon' };
  }

  async sendMessage() {
    return { success: false, message: 'AI feature not yet implemented' };
  }
}
