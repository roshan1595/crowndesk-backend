import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'crowndesk-backend',
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  ready() {
    return { status: 'ready' };
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  live() {
    return { status: 'live' };
  }
}
