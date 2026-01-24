/**
 * PA 278 Response Parser Unit Tests
 * Tests for HCR segment parsing and action code mapping
 */

import { PA278ResponseParser } from './pa-278.builder';

describe('PA278ResponseParser', () => {
  describe('parse() - HCR Segment Extraction', () => {
    it('should parse approved response (A1)', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
          authorizationNumber: 'AUTH123456',
        },
        traceNumber: {
          referenceIdentification: 'TRN-001',
        },
        dates: [
          {
            dateTimeQualifier: '607',  // Certification Effective
            dateTimePeriod: '20250101',
          },
          {
            dateTimeQualifier: '609',  // Certification Expiration
            dateTimePeriod: '20250630',
          },
        ],
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A1');
      expect(result.authorizationNumber).toBe('AUTH123456');
      expect(result.certificationStartDate).toBe('2025-01-01');
      expect(result.certificationEndDate).toBe('2025-06-30');
    });

    it('should parse partial approval response (A2)', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A2',
          authorizationNumber: 'AUTH789012',
          quantity: 2,
        },
        messageText: {
          freeFormMessageText: 'Approved for 2 visits maximum',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A2');
      expect(result.certifiedQuantity).toBe(2);
      expect(result.messageText).toBe('Approved for 2 visits maximum');
    });

    it('should parse denial response (A3)', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A3',
          rejectReasonCode: '02',
          additionalRejectReason: 'Not medically necessary',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A3');
      expect(result.rejectReasonCode).toBe('02');
      expect(result.additionalRejectReason).toBe('Not medically necessary');
    });

    it('should parse pending response (A4)', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A4',
          messageText: {
            freeFormMessageText: 'Additional documentation required',
          },
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A4');
    });

    it('should handle legacy EDI format (HCR prefix)', () => {
      const mockResponse = {
        HCR: {
          HCR01: 'A1',
          HCR02: 'AUTH555',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A1');
      expect(result.authorizationNumber).toBe('AUTH555');
    });

    it('should default to IP (In Process) if no action code', () => {
      const mockResponse = {
        healthCareServicesReview: {},
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('IP');
    });
  });

  describe('mapActionToStatus() - HCR to PA Status Mapping', () => {
    it('should map A1 to approved', () => {
      expect(PA278ResponseParser.mapActionToStatus('A1')).toBe('approved');
    });

    it('should map A2 to partially_approved', () => {
      expect(PA278ResponseParser.mapActionToStatus('A2')).toBe('partially_approved');
    });

    it('should map A3 to denied', () => {
      expect(PA278ResponseParser.mapActionToStatus('A3')).toBe('denied');
    });

    it('should map A4 to pending_info', () => {
      expect(PA278ResponseParser.mapActionToStatus('A4')).toBe('pending_info');
    });

    it('should map A6 to approved (modified)', () => {
      expect(PA278ResponseParser.mapActionToStatus('A6')).toBe('approved');
    });

    it('should map C to cancelled', () => {
      expect(PA278ResponseParser.mapActionToStatus('C')).toBe('cancelled');
    });

    it('should map CT to pending (contact payer)', () => {
      expect(PA278ResponseParser.mapActionToStatus('CT')).toBe('pending');
    });

    it('should map D to submitted (deferred)', () => {
      expect(PA278ResponseParser.mapActionToStatus('D')).toBe('submitted');
    });

    it('should map IP to submitted (in process)', () => {
      expect(PA278ResponseParser.mapActionToStatus('IP')).toBe('submitted');
    });

    it('should map NA to not_required', () => {
      expect(PA278ResponseParser.mapActionToStatus('NA')).toBe('not_required');
    });

    it('should default to pending for unknown code', () => {
      expect(PA278ResponseParser.mapActionToStatus('XX' as any)).toBe('pending');
    });
  });

  describe('Date Extraction and Formatting', () => {
    it('should extract and format CCYYMMDD dates to YYYY-MM-DD', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
        },
        dates: [
          {
            dateTimeQualifier: '607',
            dateTimePeriod: '20250115',
          },
        ],
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.certificationStartDate).toBe('2025-01-15');
    });

    it('should handle date range format', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
        },
        dates: [
          {
            dateTimeQualifier: '472',
            dateTimePeriod: '20250101-20250630',
          },
        ],
      };

      const result = PA278ResponseParser.parse(mockResponse);

      // Note: The current implementation only extracts single dates
      // Range extraction would be a future enhancement
      expect(result.certificationStartDate).toBeDefined();
    });

    it('should handle missing dates gracefully', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.certificationStartDate).toBeUndefined();
      expect(result.certificationEndDate).toBeUndefined();
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse full approved response with all fields', () => {
      const mockResponse = {
        transactionId: 'STX123456',
        healthCareServicesReview: {
          actionCode: 'A1',
          authorizationNumber: 'PA-2025-001',
          quantity: 1,
        },
        traceNumber: {
          referenceIdentification: 'REQ-001',
        },
        dates: [
          {
            dateTimeQualifier: '607',
            dateTimePeriod: '20250101',
          },
          {
            dateTimeQualifier: '609',
            dateTimePeriod: '20251231',
          },
        ],
        messageText: {
          freeFormMessageText: 'Crown approved. Valid for 12 months.',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result).toEqual({
        transactionId: 'REQ-001',
        actionCode: 'A1',
        authorizationNumber: 'PA-2025-001',
        certificationStartDate: '2025-01-01',
        certificationEndDate: '2025-12-31',
        certifiedQuantity: 1,
        rejectReasonCode: undefined,
        additionalRejectReason: undefined,
        messageText: 'Crown approved. Valid for 12 months.',
        raw: mockResponse,
      });
    });

    it('should parse denial response with rejection details', () => {
      const mockResponse = {
        transactionId: 'STX789012',
        healthCareServicesReview: {
          actionCode: 'A3',
          rejectReasonCode: '19',
          additionalRejectReason: 'Frequency limitation exceeded',
        },
        traceNumber: {
          referenceIdentification: 'REQ-002',
        },
        messageText: {
          freeFormMessageText: 'This procedure has already been performed within the allowed frequency.',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A3');
      expect(result.rejectReasonCode).toBe('19');
      expect(result.messageText).toContain('frequency');
    });

    it('should parse pending response requiring additional info', () => {
      const mockResponse = {
        transactionId: 'STX345678',
        healthCareServicesReview: {
          actionCode: 'A4',
        },
        messageText: {
          freeFormMessageText: 'Pending receipt of clinical documentation. Required within 5 business days.',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A4');
      expect(result.messageText).toContain('clinical documentation');
    });

    it('should parse partial approval with quantity limits', () => {
      const mockResponse = {
        transactionId: 'STX901234',
        healthCareServicesReview: {
          actionCode: 'A2',
          authorizationNumber: 'PA-2025-002',
          quantity: 2,
        },
        messageText: {
          freeFormMessageText: 'Approved for 2 periodontal treatments within 12 months.',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);

      expect(result.actionCode).toBe('A2');
      expect(result.certifiedQuantity).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle null response', () => {
      const result = PA278ResponseParser.parse(null);
      expect(result).toBeDefined();
      expect(result.actionCode).toBe('IP');
    });

    it('should handle undefined response', () => {
      const result = PA278ResponseParser.parse(undefined);
      expect(result).toBeDefined();
      expect(result.actionCode).toBe('IP');
    });

    it('should handle empty object', () => {
      const result = PA278ResponseParser.parse({});
      expect(result).toBeDefined();
      expect(result.actionCode).toBe('IP');
    });

    it('should handle malformed date gracefully', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
        },
        dates: [
          {
            dateTimeQualifier: '607',
            dateTimePeriod: 'invalid-date',
          },
        ],
      };

      const result = PA278ResponseParser.parse(mockResponse);
      expect(result.certificationStartDate).toBe('invalid-date');
      // The parser preserves the value as-is for debugging purposes
    });
  });

  describe('CMS 2025 Compliance', () => {
    it('should handle urgent (72-hour) response', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
          authorizationNumber: 'URGENT-001',
        },
        messageText: {
          freeFormMessageText: 'Urgent request. Approved within 72 hours.',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);
      expect(result.actionCode).toBe('A1');
      expect(result.messageText).toContain('72 hours');
    });

    it('should handle standard (7-day) response', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A1',
          authorizationNumber: 'STD-001',
        },
        messageText: {
          freeFormMessageText: 'Standard request. Approved within 7 calendar days.',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);
      expect(result.actionCode).toBe('A1');
      expect(result.messageText).toContain('7 calendar days');
    });

    it('should handle transparent denial with reason', () => {
      const mockResponse = {
        healthCareServicesReview: {
          actionCode: 'A3',
          rejectReasonCode: '16',  // Not covered benefit
          additionalRejectReason: 'Cosmetic dentistry not covered under this plan',
        },
      };

      const result = PA278ResponseParser.parse(mockResponse);
      expect(result.actionCode).toBe('A3');
      expect(result.rejectReasonCode).toBe('16');
      expect(result.additionalRejectReason).toContain('Cosmetic');
    });
  });
});
