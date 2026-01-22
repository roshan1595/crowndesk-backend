import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ServiceAuthContext } from '../guards/service-auth.guard';

/**
 * Extracts the service authentication context from the request.
 * Use with @ServiceAuth() guard.
 *
 * @example
 * ```typescript
 * @ServiceAuth()
 * @Get()
 * myHandler(@CurrentServiceAuth() auth: ServiceAuthContext) {
 *   console.log(auth.tenantId);
 * }
 * ```
 */
export const CurrentServiceAuth = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ServiceAuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.serviceAuth;
  },
);
