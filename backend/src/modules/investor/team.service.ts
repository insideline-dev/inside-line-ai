import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { teamInvite, teamMember } from './entities/team.schema';
import { investorThesis } from './entities/investor.schema';
import {
  CreateTeamInvite,
  TeamInviteResponse,
  TeamMemberResponse,
  GetTeamResponse,
} from './dto';
import { randomBytes } from 'crypto';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private drizzle: DrizzleService) {}

  /**
   * Get all invites and members for the user's investor team
   */
  async getTeam(userId: string): Promise<GetTeamResponse> {
    return this.drizzle.withRLS(userId, async (db) => {
      // Get user's investor thesis
      const [thesis] = await db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1);

      if (!thesis) {
        throw new NotFoundException('Investor thesis not found');
      }

      // Get invites
      const invites = await db
        .select()
        .from(teamInvite)
        .where(eq(teamInvite.investorThesisId, thesis.id));

      // Get members
      const members = await db
        .select()
        .from(teamMember)
        .where(eq(teamMember.investorThesisId, thesis.id));

      return {
        invites: invites.map(this.mapInviteToResponse),
        members: members.map(this.mapMemberToResponse),
      };
    });
  }

  /**
   * Create a team invite
   * Generates unique 32-char code and sets 7-day expiry
   */
  async createInvite(
    userId: string,
    dto: CreateTeamInvite,
  ): Promise<TeamInviteResponse> {
    return this.drizzle.withRLS(userId, async (db) => {
      // Get user's investor thesis
      const [thesis] = await db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1);

      if (!thesis) {
        throw new NotFoundException('Investor thesis not found');
      }

      // Check for existing pending invite
      const [existingInvite] = await db
        .select()
        .from(teamInvite)
        .where(
          and(
            eq(teamInvite.investorThesisId, thesis.id),
            eq(teamInvite.email, dto.email),
            eq(teamInvite.status, 'pending'),
          ),
        )
        .limit(1);

      if (existingInvite) {
        throw new BadRequestException(
          'A pending invite already exists for this email',
        );
      }

      // Generate unique invite code
      const inviteCode = randomBytes(16).toString('hex'); // 32 chars

      // Set expiry to 7 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Create invite
      const [invite] = await db
        .insert(teamInvite)
        .values({
          investorThesisId: thesis.id,
          invitedByUserId: userId,
          email: dto.email,
          role: dto.role,
          inviteCode,
          expiresAt,
          status: 'pending',
        })
        .returning();

      this.logger.log(
        `Created invite ${invite.id} for ${dto.email} by user ${userId}`,
      );

      return this.mapInviteToResponse(invite);
    });
  }

  /**
   * Cancel a pending invite
   * Only the user who created the invite can cancel it
   */
  async cancelInvite(userId: string, inviteId: string): Promise<void> {
    return this.drizzle.withRLS(userId, async (db) => {
      // Get the invite
      const [invite] = await db
        .select()
        .from(teamInvite)
        .where(eq(teamInvite.id, inviteId))
        .limit(1);

      if (!invite) {
        throw new NotFoundException('Invite not found');
      }

      // Check ownership
      if (invite.invitedByUserId !== userId) {
        throw new ForbiddenException('You can only cancel your own invites');
      }

      // Check status
      if (invite.status !== 'pending') {
        throw new BadRequestException('Only pending invites can be cancelled');
      }

      // Update status
      await db
        .update(teamInvite)
        .set({ status: 'cancelled' })
        .where(eq(teamInvite.id, inviteId));

      this.logger.log(`Cancelled invite ${inviteId} by user ${userId}`);
    });
  }

  /**
   * Remove a team member
   * Only team admins can remove members
   * Cannot remove yourself
   */
  async removeMember(userId: string, memberId: string): Promise<void> {
    return this.drizzle.withRLS(userId, async (db) => {
      // Get user's investor thesis
      const [thesis] = await db
        .select()
        .from(investorThesis)
        .where(eq(investorThesis.userId, userId))
        .limit(1);

      if (!thesis) {
        throw new NotFoundException('Investor thesis not found');
      }

      // Get the member to remove
      const [member] = await db
        .select()
        .from(teamMember)
        .where(eq(teamMember.id, memberId))
        .limit(1);

      if (!member) {
        throw new NotFoundException('Team member not found');
      }

      // Check that member belongs to this thesis
      if (member.investorThesisId !== thesis.id) {
        throw new ForbiddenException(
          'You can only remove members from your own team',
        );
      }

      // Cannot remove yourself
      if (member.userId === userId) {
        throw new BadRequestException('You cannot remove yourself from the team');
      }

      // Delete member
      await db.delete(teamMember).where(eq(teamMember.id, memberId));

      this.logger.log(`Removed member ${memberId} by user ${userId}`);
    });
  }

  /**
   * Accept an invite by code
   * Creates team member record and marks invite as accepted
   */
  async acceptInvite(
    acceptingUserId: string,
    inviteCode: string,
  ): Promise<TeamMemberResponse> {
    return this.drizzle.withRLS(acceptingUserId, async (db) => {
      // Find invite by code
      const [invite] = await db
        .select()
        .from(teamInvite)
        .where(eq(teamInvite.inviteCode, inviteCode))
        .limit(1);

      if (!invite) {
        throw new NotFoundException('Invite not found');
      }

      // Check status
      if (invite.status !== 'pending') {
        throw new BadRequestException('This invite is no longer valid');
      }

      // Check expiry
      if (new Date() > invite.expiresAt) {
        // Mark as expired
        await db
          .update(teamInvite)
          .set({ status: 'expired' })
          .where(eq(teamInvite.id, invite.id));

        throw new BadRequestException('This invite has expired');
      }

      // Check if user is already a member
      const [existingMember] = await db
        .select()
        .from(teamMember)
        .where(
          and(
            eq(teamMember.investorThesisId, invite.investorThesisId),
            eq(teamMember.userId, acceptingUserId),
          ),
        )
        .limit(1);

      if (existingMember) {
        throw new BadRequestException('You are already a member of this team');
      }

      // Create team member
      const [member] = await db
        .insert(teamMember)
        .values({
          investorThesisId: invite.investorThesisId,
          userId: acceptingUserId,
          email: invite.email,
          role: invite.role,
        })
        .returning();

      // Update invite status
      await db
        .update(teamInvite)
        .set({
          status: 'accepted',
          acceptedByUserId: acceptingUserId,
          acceptedAt: new Date(),
        })
        .where(eq(teamInvite.id, invite.id));

      this.logger.log(
        `User ${acceptingUserId} accepted invite ${invite.id} and joined team`,
      );

      return this.mapMemberToResponse(member);
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapInviteToResponse(invite: typeof teamInvite.$inferSelect): TeamInviteResponse {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      inviteCode: invite.inviteCode,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }

  private mapMemberToResponse(member: typeof teamMember.$inferSelect): TeamMemberResponse {
    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    };
  }
}
