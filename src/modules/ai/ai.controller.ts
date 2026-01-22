import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('ai')
@ApiBearerAuth('clerk-jwt')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('insights')
  @ApiOperation({ summary: 'Get AI insights for tenant' })
  async getInsights(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.aiService.getInsights(user.tenantId, status);
  }

  @Get('insights/stats')
  @ApiOperation({ summary: 'Get AI insights statistics' })
  async getInsightsStats(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getInsightsStats(user.tenantId);
  }

  @Post('insights/:id/approve')
  @ApiOperation({ summary: 'Approve an AI insight' })
  async approveInsight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.updateInsightStatus(user.tenantId, id, 'approved');
  }

  @Post('insights/:id/reject')
  @ApiOperation({ summary: 'Reject an AI insight' })
  async rejectInsight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.updateInsightStatus(user.tenantId, id, 'rejected');
  }

  @Post('intent')
  @ApiOperation({ summary: 'Classify patient intent from message' })
  async classifyIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { message: string; context?: any },
  ) {
    return this.aiService.classifyIntent(user.tenantId, body.message, body.context);
  }

  @Post('summary')
  @ApiOperation({ summary: 'Generate summary from clinical notes' })
  async generateSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { text: string; type?: string },
  ) {
    return this.aiService.generateSummary(user.tenantId, body.text, body.type);
  }

  @Post('code-suggestion')
  @ApiOperation({ summary: 'Get CDT code suggestions from notes' })
  async suggestCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { clinicalNotes: string; patientId?: string; appointmentId?: string },
  ) {
    return this.aiService.suggestCodes(
      user.tenantId,
      body.clinicalNotes,
      body.patientId,
      body.appointmentId,
    );
  }

  @Post('validate-code')
  @ApiOperation({ summary: 'Validate a CDT code' })
  async validateCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code: string; clinicalNotes: string },
  ) {
    return this.aiService.validateCode(user.tenantId, body.code, body.clinicalNotes);
  }
}
