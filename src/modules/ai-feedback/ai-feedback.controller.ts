import { 
  Controller, 
  Get, 
  Post, 
  Delete, 
  Param, 
  Body, 
  Query,
  ParseArrayPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AIFeedbackService } from './ai-feedback.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { 
  RecordFeedbackDto, 
  RecordOutcomeDto, 
  GetUnprocessedFeedbackOptions,
  GetFeedbackStatsOptions,
  ListFeedbackOptions,
  DeleteFeedbackDto,
} from './dto/ai-feedback.dto';

@ApiTags('ai-feedback')
@ApiBearerAuth('clerk-jwt')
@Controller('ai-feedback')
export class AIFeedbackController {
  constructor(private readonly aiFeedbackService: AIFeedbackService) {}

  @Post('record')
  @ApiOperation({ 
    summary: 'Record user feedback on AI suggestion',
    description: 'Track whether user approved, rejected, or modified an AI suggestion. Automatically calculates retraining weight.',
  })
  async recordFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordFeedbackDto,
  ) {
    return this.aiFeedbackService.recordFeedback(user.tenantId, dto);
  }

  @Post(':feedbackId/outcome')
  @ApiOperation({ 
    summary: 'Record external outcome for feedback event',
    description: 'Add real-world result (e.g., claim approved/denied) to existing feedback. Boosts retraining weight by 1.5x.',
  })
  async recordOutcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param('feedbackId') feedbackId: string,
    @Body() dto: RecordOutcomeDto,
  ) {
    return this.aiFeedbackService.recordOutcome(user.tenantId, feedbackId, dto);
  }

  @Get('unprocessed')
  @ApiOperation({ 
    summary: 'Get unprocessed feedback events for retraining',
    description: 'Returns feedback marked for retraining (shouldRetrain=true, wasRetrained=false). Ordered by weight DESC, then createdAt ASC.',
  })
  @ApiQuery({ name: 'agentType', required: false })
  @ApiQuery({ name: 'suggestionType', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'minWeight', required: false })
  async getUnprocessedFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('agentType') agentType?: string,
    @Query('suggestionType') suggestionType?: string,
    @Query('limit') limit?: number,
    @Query('minWeight') minWeight?: number,
  ) {
    const options: GetUnprocessedFeedbackOptions = {
      agentType,
      suggestionType,
      limit: limit ? parseInt(String(limit)) : undefined,
      minWeight: minWeight ? parseFloat(String(minWeight)) : undefined,
    };
    return this.aiFeedbackService.getUnprocessedFeedback(user.tenantId, options);
  }

  @Post('mark-retrained')
  @ApiOperation({ 
    summary: 'Mark feedback events as retrained',
    description: 'Sets wasRetrained=true for specified feedback IDs. Call after processing events in retraining job.',
  })
  async markAsRetrained(
    @CurrentUser() user: AuthenticatedUser,
    @Body('feedbackIds') feedbackIds: string[],
  ) {
    return this.aiFeedbackService.markAsRetrained(user.tenantId, feedbackIds);
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get feedback statistics and AI performance metrics',
    description: 'Returns total events, approval rate, average confidence, pending retrain count. Optional filter by agentType.',
  })
  @ApiQuery({ name: 'agentType', required: false })
  async getFeedbackStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('agentType') agentType?: string,
  ) {
    const options: GetFeedbackStatsOptions = { agentType };
    return this.aiFeedbackService.getFeedbackStats(user.tenantId, options);
  }

  @Get()
  @ApiOperation({ 
    summary: 'List feedback events with pagination',
    description: 'Retrieve feedback events with filtering. Supports pagination, agentType, suggestionType, outcomeAction filters.',
  })
  @ApiQuery({ name: 'agentType', required: false })
  @ApiQuery({ name: 'suggestionType', required: false })
  @ApiQuery({ name: 'outcomeAction', required: false })
  @ApiQuery({ name: 'wasRetrained', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async listFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('agentType') agentType?: string,
    @Query('suggestionType') suggestionType?: string,
    @Query('outcomeAction') outcomeAction?: string,
    @Query('wasRetrained') wasRetrained?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize?: number,
  ) {
    const options: ListFeedbackOptions = {
      agentType,
      suggestionType,
      outcomeAction,
      wasRetrained: wasRetrained ? wasRetrained === 'true' : undefined,
      page,
      pageSize,
    };
    return this.aiFeedbackService.listFeedback(user.tenantId, options);
  }

  @Get(':feedbackId')
  @ApiOperation({ 
    summary: 'Get single feedback event by ID',
    description: 'Retrieve detailed information for a specific feedback event.',
  })
  async getFeedbackById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('feedbackId') feedbackId: string,
  ) {
    return this.aiFeedbackService.getFeedbackById(user.tenantId, feedbackId);
  }

  @Delete()
  @ApiOperation({ 
    summary: 'Delete feedback events',
    description: 'Remove feedback events. Use for GDPR compliance or data cleanup.',
  })
  async deleteFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteFeedbackDto,
  ) {
    return this.aiFeedbackService.deleteFeedback(user.tenantId, dto.feedbackIds);
  }
}
