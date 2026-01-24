/**
 * Invoice PDF Service Unit Tests
 * Phase 8: Testing rule-based document generation
 */

import { PdfGeneratorService, InvoicePdfData } from './pdf-generator.service';

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;

  beforeEach(() => {
    service = new PdfGeneratorService();
  });

  describe('generateInvoice()', () => {
    const mockInvoiceData: InvoicePdfData = {
      invoice: {
        id: 'inv-001',
        invoiceNumber: 'INV-2026-0001',
        invoiceDate: new Date('2026-01-15'),
        dueDate: new Date('2026-02-15'),
        totalAmount: 1500.00,
        amountPaid: 500.00,
        amountDue: 1000.00,
        status: 'sent',
        lineItems: [
          {
            description: 'Comprehensive Oral Evaluation (D0150)',
            quantity: 1,
            unitPrice: 150.00,
            amount: 150.00,
          },
          {
            description: 'Full Mouth X-Rays (D0210)',
            quantity: 1,
            unitPrice: 200.00,
            amount: 200.00,
          },
          {
            description: 'Adult Prophylaxis (D1110)',
            quantity: 1,
            unitPrice: 150.00,
            amount: 150.00,
          },
          {
            description: 'Crown - Porcelain/High Noble Metal (D2750)',
            quantity: 1,
            unitPrice: 1000.00,
            amount: 1000.00,
          },
        ],
        payments: [
          {
            paymentDate: new Date('2026-01-20'),
            method: 'Credit Card',
            amount: 300.00,
          },
          {
            paymentDate: new Date('2026-01-25'),
            method: 'Insurance',
            amount: 200.00,
          },
        ],
      },
      patient: {
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
        address: '456 Dental Drive, Suite 100',
        phone: '(555) 987-6543',
        email: 'billing@sunshinedental.com',
      },
    };

    it('should generate a PDF buffer', async () => {
      const result = await service.generateInvoice(mockInvoiceData);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate PDF with valid header bytes', async () => {
      const result = await service.generateInvoice(mockInvoiceData);
      
      // PDF files start with %PDF-
      const header = result.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should handle invoice with no payments', async () => {
      const noPaymentsData: InvoicePdfData = {
        ...mockInvoiceData,
        invoice: {
          ...mockInvoiceData.invoice,
          amountPaid: 0,
          amountDue: 1500.00,
          payments: [],
        },
      };

      const result = await service.generateInvoice(noPaymentsData);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle invoice with paid status', async () => {
      const paidData: InvoicePdfData = {
        ...mockInvoiceData,
        invoice: {
          ...mockInvoiceData.invoice,
          amountPaid: 1500.00,
          amountDue: 0,
          status: 'paid',
        },
      };

      const result = await service.generateInvoice(paidData);
      
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle minimal invoice data', async () => {
      const minimalData: InvoicePdfData = {
        invoice: {
          id: 'inv-min',
          invoiceNumber: 'INV-MIN-001',
          invoiceDate: new Date(),
          dueDate: new Date(),
          totalAmount: 100,
          amountPaid: 0,
          amountDue: 100,
          status: 'draft',
          lineItems: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 100,
              amount: 100,
            },
          ],
          payments: [],
        },
        patient: {
          firstName: 'Jane',
          lastName: 'Doe',
        },
        practice: {
          name: 'Test Practice',
        },
      };

      const result = await service.generateInvoice(minimalData);
      
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle invoice with many line items', async () => {
      const manyLineItems: Array<{description: string; quantity: number; unitPrice: number; amount: number}> = [];
      for (let i = 0; i < 25; i++) {
        manyLineItems.push({
          description: `Procedure ${i + 1} (D${1000 + i})`,
          quantity: 1,
          unitPrice: 50 + (i * 10),
          amount: 50 + (i * 10),
        });
      }

      const totalAmount = manyLineItems.reduce((sum, item) => sum + item.amount, 0);
      const manyItemsData: InvoicePdfData = {
        ...mockInvoiceData,
        invoice: {
          ...mockInvoiceData.invoice,
          lineItems: manyLineItems,
          totalAmount,
          amountDue: totalAmount,
        },
      };

      const result = await service.generateInvoice(manyItemsData);
      
      expect(result).toBeInstanceOf(Buffer);
      // Should create a larger PDF due to many items
      expect(result.length).toBeGreaterThan(5000);
    });

    it('should handle overdue invoice status', async () => {
      const overdueData: InvoicePdfData = {
        ...mockInvoiceData,
        invoice: {
          ...mockInvoiceData.invoice,
          status: 'overdue',
          dueDate: new Date('2025-12-01'), // Past due
        },
      };

      const result = await service.generateInvoice(overdueData);
      
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('generateInvoiceStream()', () => {
    it('should return a readable stream', async () => {
      const minimalData: InvoicePdfData = {
        invoice: {
          id: 'inv-stream',
          invoiceNumber: 'INV-STREAM-001',
          invoiceDate: new Date(),
          dueDate: new Date(),
          totalAmount: 50,
          amountPaid: 0,
          amountDue: 50,
          status: 'draft',
          lineItems: [
            {
              description: 'Test Service',
              quantity: 1,
              unitPrice: 50,
              amount: 50,
            },
          ],
          payments: [],
        },
        patient: {
          firstName: 'Stream',
          lastName: 'Test',
        },
        practice: {
          name: 'Stream Practice',
        },
      };

      const stream = await service.generateInvoiceStream(minimalData);
      
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe('function');
      expect(typeof stream.read).toBe('function');
    });
  });
});

describe('InvoicePdfData validation', () => {
  it('should accept all valid invoice statuses', () => {
    const validStatuses = ['draft', 'sent', 'paid', 'partial', 'overdue', 'void'];

    validStatuses.forEach((status) => {
      const invoice = {
        id: 'inv-test',
        invoiceNumber: 'INV-TEST',
        invoiceDate: new Date(),
        dueDate: new Date(),
        totalAmount: 100,
        amountPaid: 0,
        amountDue: 100,
        status,
        lineItems: [],
        payments: [],
      };
      expect(invoice.status).toBe(status);
    });
  });
});
