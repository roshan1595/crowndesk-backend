/**
 * CrownDesk V2 - Retell AI Service
 * Wrapper for Retell AI API operations
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface RetellAgentConfig {
  agent_name: string;
  voice_id: string;
  language: string;
  response_engine?: {
    type: string;
    llm_websocket_url?: string;
  };
  begin_message?: string;
  general_prompt?: string;
  enable_backchannel?: boolean;
  ambient_sound?: string;
  webhook_url?: string;
}

export interface RetellAgentResponse {
  agent_id: string;
  agent_name: string;
  voice_id: string;
  language: string;
  response_engine: any;
  last_modification_timestamp: number;
}

@Injectable()
export class RetellService {
  private readonly logger = new Logger(RetellService.name);
  private readonly baseUrl = 'https://api.retellai.com';
  private apiKey: string | undefined;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('RETELL_API_KEY');

    if (!this.apiKey) {
      this.logger.warn('Retell API key not configured');
    } else {
      this.logger.log('Retell AI service initialized');
    }
  }

  /**
   * Create agent in Retell AI
   */
  async createAgent(config: RetellAgentConfig): Promise<RetellAgentResponse> {
    try {
      if (!this.apiKey) {
        throw new InternalServerErrorException('Retell API not configured');
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/create-agent`, config, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`Created Retell agent: ${response.data.agent_id}`);
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to create Retell agent', error?.response?.data || error);
      throw new InternalServerErrorException('Failed to create Retell agent');
    }
  }

  /**
   * Update agent in Retell AI
   */
  async updateAgent(agentId: string, config: Partial<RetellAgentConfig>): Promise<RetellAgentResponse> {
    try {
      if (!this.apiKey) {
        throw new InternalServerErrorException('Retell API not configured');
      }

      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}/update-agent/${agentId}`, config, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`Updated Retell agent: ${agentId}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to update Retell agent: ${agentId}`, error?.response?.data || error);
      throw new InternalServerErrorException('Failed to update Retell agent');
    }
  }

  /**
   * Get agent from Retell AI
   */
  async getAgent(agentId: string): Promise<RetellAgentResponse> {
    try {
      if (!this.apiKey) {
        throw new InternalServerErrorException('Retell API not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/get-agent/${agentId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get Retell agent: ${agentId}`, error?.response?.data || error);
      throw new InternalServerErrorException('Failed to get Retell agent');
    }
  }

  /**
   * List agents from Retell AI
   */
  async listAgents(): Promise<RetellAgentResponse[]> {
    try {
      if (!this.apiKey) {
        throw new InternalServerErrorException('Retell API not configured');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/list-agents`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to list Retell agents', error?.response?.data || error);
      throw new InternalServerErrorException('Failed to list Retell agents');
    }
  }

  /**
   * Delete agent from Retell AI
   */
  async deleteAgent(agentId: string): Promise<void> {
    try {
      if (!this.apiKey) {
        throw new InternalServerErrorException('Retell API not configured');
      }

      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/delete-agent/${agentId}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }),
      );

      this.logger.log(`Deleted Retell agent: ${agentId}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete Retell agent: ${agentId}`, error?.response?.data || error);
      throw new InternalServerErrorException('Failed to delete Retell agent');
    }
  }

  /**
   * Register phone number with agent in Retell
   */
  async registerPhoneNumber(agentId: string, phoneNumber: string): Promise<void> {
    try {
      if (!this.apiKey) {
        throw new InternalServerErrorException('Retell API not configured');
      }

      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/register-phone-number`,
          {
            agent_id: agentId,
            phone_number: phoneNumber,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`Registered phone number ${phoneNumber} with agent ${agentId}`);
    } catch (error: any) {
      this.logger.error('Failed to register phone number', error?.response?.data || error);
      throw new InternalServerErrorException('Failed to register phone number');
    }
  }
}
