/**
 * Statement PDF Service Unit Tests
 * Phase 8: Testing rule-based document generation
 */

import { StatementPdfService, StatementPdfData, StatementTransaction } from './statement-pdf.service';

describe('StatementPdfService', () => {
  let service: StatementPdfService;

  beforeEach(() => {
    service = new StatementPdfService();
  });

  describe('generateStatement()', () => {
    const mockStatementData: StatementPdfData = {
      statement: {
        id: 'stmt-001',
        statementNumber: 'STM-ABC123-20260115',
        statementDate: new Date('2026-01-15'),
        periodStart: new Date('2025-10-01'),
        periodEnd: new Date('2026-01-15'),
        previousBalance: 150.00,
        newCharges: 500.00,
        payments: 200.00,
        insurancePayments: 350.00,
        adjustments: 25.00,
        currentBalance: 75.00,
        minimumPaymentDue: 25.00,
        paymentDueDate: new Date('2026-02-15'),
      },
      aging: {
        current: 75.00,
        days30: 0,
        days60: 0,
        days90Plus: 0,
        total: 75.00,
      },
      transactions: [
        {
          date: new Date('2025-11-01'),
          type: 'charge',
          description: 'Preventive - Adult Prophy',
          procedureCode: 'D1110',
          amount: 150.00,
          balance: 300.00,
        },
        {
          date: new Date('2025-11-15'),
          type: 'insurance_payment',
          description: 'Insurance Payment - Delta Dental',
          amount: -120.00,
          balance: 180.00,
        },
        {
          date: new Date('2025-12-01'),
          type: 'charge',
          description: 'Crown - Porcelain/High Noble Metal',
          procedureCode: 'D2750',
          amount: 1200.00,
          balance: 1380.00,
        },
        {
          date: new Date('2025-12-15'),
          type: 'payment',
          description: 'Patient Payment - Credit Card',
          amount: -200.00,
          balance: 1180.00,
        },
        {
          date: new Date('2026-01-05'),
          type: 'insurance_payment',
          description: 'Insurance Payment - Delta Dental',
          amount: -1080.00,
          balance: 100.00,
        },
        {
          date: new Date('2026-01-10'),
          type: 'adjustment',
          description: 'Courtesy Adjustment',
          amount: -25.00,
          balance: 75.00,
        },
      ],
      patient: {
        accountNumber: 'PT-12345',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@email.com',
        phone: '(555) 123-4567',
        address: {
          street: '123 Main Street',
          city: 'Anytown',
          state: 'CA',
          zip: '90210',
        },
      },
      practice: {
        name: 'Sunshine Dental Care',
        address: '456 Dental Drive, Suite 100, Healthville, CA 90211',
        phone: '(555) 987-6543',
        fax: '(555) 987-6544',
        email: 'billing@sunshinedental.com',
        website: 'www.sunshinedental.com',
        paymentUrl: 'https://pay.sunshinedental.com',
      },
      insuranceSummary: {
        primaryInsurance: 'Delta Dental Premier',
        pendingClaims: 1,
        expectedPayments: 250.00,
      },
      paymentOptions: {
        acceptsCreditCards: true,
        acceptsChecks: true,
        hasPaymentPlan: true,
        onlinePaymentUrl: 'https://pay.sunshinedental.com',
      },
    };

    it('should generate a PDF buffer', async () => {
      const result = await service.generateStatement(mockStatementData);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate PDF with valid header bytes', async () => {
      const result = await service.generateStatement(mockStatementData);
      
      // PDF files start with %PDF-
      const header = result.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should handle minimal statement data', async () => {
      const minimalData: StatementPdfData = {
        statement: {
          id: 'stmt-min',
          statementNumber: 'STM-MIN-001',
          statementDate: new Date(),
          periodStart: new Date(),
          periodEnd: new Date(),
          previousBalance: 0,
          newCharges: 100,
          payments: 0,
          insurancePayments: 0,
          adjustments: 0,
          currentBalance: 100,
        },
        aging: {
          current: 100,
          days30: 0,
          days60: 0,
          days90Plus: 0,
          total: 100,
        },
        transactions: [],
        patient: {
          firstName: 'Jane',
          lastName: 'Doe',
        },
        practice: {
          name: 'Test Practice',
        },
      };

      const result = await service.generateStatement(minimalData);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle statement with zero balance', async () => {
      const zeroBalanceData = {
        ...mockStatementData,
        statement: {
          ...mockStatementData.statement,
          currentBalance: 0,
          previousBalance: 100,
          payments: 100,
        },
        aging: {
          current: 0,
          days30: 0,
          days60: 0,
          days90Plus: 0,
          total: 0,
        },
      };

      const result = await service.generateStatement(zeroBalanceData);
      
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle statement with overdue balance', async () => {
      const overdueData = {
        ...mockStatementData,
        aging: {
          current: 50,
          days30: 100,
          days60: 75,
          days90Plus: 200,
          total: 425,
        },
      };

      const result = await service.generateStatement(overdueData);
      
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle many transactions', async () => {
      const manyTransactions: StatementTransaction[] = [];
      for (let i = 0; i < 50; i++) {
        manyTransactions.push({
          date: new Date(`2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`),
          type: i % 3 === 0 ? 'charge' : i % 3 === 1 ? 'payment' : 'insurance_payment',
          description: `Transaction ${i + 1}`,
          procedureCode: i % 3 === 0 ? `D${1000 + i}` : undefined,
          amount: i % 3 === 0 ? 100 + i : -(50 + i),
          balance: 1000 + (i * 10),
        });
      }

      const manyTransactionsData = {
        ...mockStatementData,
        transactions: manyTransactions,
      };

      const result = await service.generateStatement(manyTransactionsData);
      
      expect(result).toBeInstanceOf(Buffer);
      // Should create a multi-page PDF
      expect(result.length).toBeGreaterThan(10000);
    });
  });

  describe('generateStatementStream()', () => {
    it('should return a readable stream', async () => {
      const minimalData: StatementPdfData = {
        statement: {
          id: 'stmt-stream',
          statementNumber: 'STM-STREAM-001',
          statementDate: new Date(),
          periodStart: new Date(),
          periodEnd: new Date(),
          previousBalance: 0,
          newCharges: 50,
          payments: 0,
          insurancePayments: 0,
          adjustments: 0,
          currentBalance: 50,
        },
        aging: {
          current: 50,
          days30: 0,
          days60: 0,
          days90Plus: 0,
          total: 50,
        },
        transactions: [],
        patient: {
          firstName: 'Stream',
          lastName: 'Test',
        },
        practice: {
          name: 'Stream Practice',
        },
      };

      const stream = await service.generateStatementStream(minimalData);
      
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe('function');
      expect(typeof stream.read).toBe('function');
    });
  });
});

describe('StatementTransaction Types', () => {
  it('should accept all valid transaction types', () => {
    const validTypes: StatementTransaction['type'][] = [
      'charge',
      'payment',
      'insurance_payment',
      'adjustment',
      'refund',
    ];

    validTypes.forEach((type) => {
      const transaction: StatementTransaction = {
        date: new Date(),
        type,
        description: 'Test transaction',
        amount: 100,
        balance: 100,
      };
      expect(transaction.type).toBe(type);
    });
  });
});
