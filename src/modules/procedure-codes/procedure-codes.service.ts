/**
 * CrownDesk V2 - Procedure Codes Service
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 4
 * Manages CDT procedure codes and fee schedules
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CDTCategory } from '@prisma/client';

export interface CreateProcedureCodeDto {
  code: string;
  category: CDTCategory;
  description: string;
  abbreviation?: string;
  defaultFee: number;
  typicalCoverage?: number;
  frequencyLimit?: string;
  typicalDuration?: number;
  isActive?: boolean;
}

export interface UpdateProcedureCodeDto {
  description?: string;
  abbreviation?: string;
  defaultFee?: number;
  typicalCoverage?: number;
  frequencyLimit?: string;
  typicalDuration?: number;
  isActive?: boolean;
}

export interface ProcedureCodeSearchOptions {
  search?: string;
  category?: CDTCategory;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ProcedureCodesService {
  private readonly logger = new Logger(ProcedureCodesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all procedure codes for a tenant
   */
  async findByTenant(tenantId: string, options: ProcedureCodeSearchOptions = {}) {
    const { search, category, isActive = true, limit = 100, offset = 0 } = options;

    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { abbreviation: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    const [codes, total] = await Promise.all([
      this.prisma.procedureCode.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { code: 'asc' },
      }),
      this.prisma.procedureCode.count({ where }),
    ]);

    return {
      data: codes,
      total,
      limit,
      offset,
      hasMore: offset + codes.length < total,
    };
  }

  /**
   * Get a single procedure code
   */
  async findByCode(tenantId: string, code: string) {
    const procedureCode = await this.prisma.procedureCode.findFirst({
      where: { tenantId, code },
    });

    if (!procedureCode) {
      throw new NotFoundException(`Procedure code ${code} not found`);
    }

    return procedureCode;
  }

  /**
   * Get procedure codes by category
   */
  async findByCategory(tenantId: string, category: CDTCategory) {
    return this.prisma.procedureCode.findMany({
      where: { tenantId, category, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Create a new procedure code
   */
  async create(tenantId: string, dto: CreateProcedureCodeDto) {
    // Check if code already exists
    const existing = await this.prisma.procedureCode.findFirst({
      where: { tenantId, code: dto.code },
    });

    if (existing) {
      throw new Error(`Procedure code ${dto.code} already exists`);
    }

    const procedureCode = await this.prisma.procedureCode.create({
      data: {
        tenantId,
        code: dto.code,
        category: dto.category,
        description: dto.description,
        abbreviation: dto.abbreviation,
        defaultFee: dto.defaultFee,
        typicalCoverage: dto.typicalCoverage,
        frequencyLimit: dto.frequencyLimit,
        typicalDuration: dto.typicalDuration,
        isActive: dto.isActive ?? true,
        version: '2026',
      },
    });

    this.logger.log(`Created procedure code ${dto.code}`);

    return procedureCode;
  }

  /**
   * Update a procedure code
   */
  async update(tenantId: string, code: string, dto: UpdateProcedureCodeDto) {
    const existing = await this.prisma.procedureCode.findFirst({
      where: { tenantId, code },
    });

    if (!existing) {
      throw new NotFoundException(`Procedure code ${code} not found`);
    }

    return this.prisma.procedureCode.update({
      where: { id: existing.id },
      data: dto,
    });
  }

  /**
   * Update fee for a procedure code
   */
  async updateFee(tenantId: string, code: string, fee: number) {
    return this.update(tenantId, code, { defaultFee: fee });
  }

  /**
   * Get complete fee schedule
   */
  async getFeeSchedule(tenantId: string) {
    const codes = await this.prisma.procedureCode.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      select: {
        code: true,
        category: true,
        description: true,
        defaultFee: true,
        typicalCoverage: true,
      },
    });

    // Group by category
    const grouped = codes.reduce((acc, code) => {
      if (!acc[code.category]) {
        acc[code.category] = [];
      }
      acc[code.category].push(code);
      return acc;
    }, {} as Record<string, typeof codes>);

    return {
      codes,
      byCategory: grouped,
      totalCodes: codes.length,
    };
  }

  /**
   * Seed standard CDT codes
   */
  async seedStandardCodes(tenantId: string) {
    const standardCodes: CreateProcedureCodeDto[] = [
      // Diagnostic (D0100-D0999)
      { code: 'D0120', category: 'diagnostic', description: 'Periodic oral evaluation - established patient', defaultFee: 55, typicalCoverage: 100, frequencyLimit: '2 per year', typicalDuration: 15 },
      { code: 'D0140', category: 'diagnostic', description: 'Limited oral evaluation - problem focused', defaultFee: 75, typicalCoverage: 100, typicalDuration: 20 },
      { code: 'D0150', category: 'diagnostic', description: 'Comprehensive oral evaluation - new or established patient', defaultFee: 85, typicalCoverage: 100, frequencyLimit: '1 per 3 years', typicalDuration: 30 },
      { code: 'D0210', category: 'diagnostic', description: 'Intraoral - complete series of radiographic images', defaultFee: 125, typicalCoverage: 100, frequencyLimit: '1 per 3-5 years', typicalDuration: 20 },
      { code: 'D0220', category: 'diagnostic', description: 'Intraoral - periapical first radiographic image', defaultFee: 25, typicalCoverage: 100, typicalDuration: 5 },
      { code: 'D0230', category: 'diagnostic', description: 'Intraoral - periapical each additional radiographic image', defaultFee: 20, typicalCoverage: 100, typicalDuration: 3 },
      { code: 'D0274', category: 'diagnostic', description: 'Bitewings - four radiographic images', defaultFee: 60, typicalCoverage: 100, frequencyLimit: '2 per year', typicalDuration: 10 },
      { code: 'D0330', category: 'diagnostic', description: 'Panoramic radiographic image', defaultFee: 110, typicalCoverage: 100, frequencyLimit: '1 per 3-5 years', typicalDuration: 10 },

      // Preventive (D1000-D1999)
      { code: 'D1110', category: 'preventive', description: 'Prophylaxis - adult', defaultFee: 95, typicalCoverage: 100, frequencyLimit: '2 per year', typicalDuration: 45 },
      { code: 'D1120', category: 'preventive', description: 'Prophylaxis - child', defaultFee: 65, typicalCoverage: 100, frequencyLimit: '2 per year', typicalDuration: 30 },
      { code: 'D1206', category: 'preventive', description: 'Topical application of fluoride varnish', defaultFee: 35, typicalCoverage: 100, frequencyLimit: '2 per year', typicalDuration: 5 },
      { code: 'D1351', category: 'preventive', description: 'Sealant - per tooth', defaultFee: 45, typicalCoverage: 100, frequencyLimit: '1 per tooth per 3 years', typicalDuration: 10 },

      // Restorative (D2000-D2999)
      { code: 'D2140', category: 'restorative', description: 'Amalgam - one surface, primary or permanent', defaultFee: 135, typicalCoverage: 80, typicalDuration: 30 },
      { code: 'D2150', category: 'restorative', description: 'Amalgam - two surfaces, primary or permanent', defaultFee: 175, typicalCoverage: 80, typicalDuration: 40 },
      { code: 'D2160', category: 'restorative', description: 'Amalgam - three surfaces, primary or permanent', defaultFee: 210, typicalCoverage: 80, typicalDuration: 45 },
      { code: 'D2330', category: 'restorative', description: 'Resin-based composite - one surface, anterior', defaultFee: 165, typicalCoverage: 80, typicalDuration: 35 },
      { code: 'D2331', category: 'restorative', description: 'Resin-based composite - two surfaces, anterior', defaultFee: 195, typicalCoverage: 80, typicalDuration: 45 },
      { code: 'D2391', category: 'restorative', description: 'Resin-based composite - one surface, posterior', defaultFee: 175, typicalCoverage: 80, typicalDuration: 35 },
      { code: 'D2392', category: 'restorative', description: 'Resin-based composite - two surfaces, posterior', defaultFee: 225, typicalCoverage: 80, typicalDuration: 45 },
      { code: 'D2740', category: 'restorative', description: 'Crown - porcelain/ceramic substrate', defaultFee: 1150, typicalCoverage: 50, typicalDuration: 90 },
      { code: 'D2750', category: 'restorative', description: 'Crown - porcelain fused to high noble metal', defaultFee: 1200, typicalCoverage: 50, typicalDuration: 90 },

      // Endodontics (D3000-D3999)
      { code: 'D3110', category: 'endodontics', description: 'Pulp cap - direct (excluding final restoration)', defaultFee: 85, typicalCoverage: 80, typicalDuration: 15 },
      { code: 'D3220', category: 'endodontics', description: 'Therapeutic pulpotomy (excluding final restoration)', defaultFee: 195, typicalCoverage: 80, typicalDuration: 30 },
      { code: 'D3310', category: 'endodontics', description: 'Endodontic therapy, anterior tooth (excluding final restoration)', defaultFee: 750, typicalCoverage: 50, typicalDuration: 90 },
      { code: 'D3320', category: 'endodontics', description: 'Endodontic therapy, premolar tooth (excluding final restoration)', defaultFee: 875, typicalCoverage: 50, typicalDuration: 90 },
      { code: 'D3330', category: 'endodontics', description: 'Endodontic therapy, molar tooth (excluding final restoration)', defaultFee: 1050, typicalCoverage: 50, typicalDuration: 120 },

      // Periodontics (D4000-D4999)
      { code: 'D4341', category: 'periodontics', description: 'Periodontal scaling and root planing - four or more teeth per quadrant', defaultFee: 275, typicalCoverage: 80, frequencyLimit: '1 per quadrant per 2 years', typicalDuration: 60 },
      { code: 'D4342', category: 'periodontics', description: 'Periodontal scaling and root planing - one to three teeth per quadrant', defaultFee: 175, typicalCoverage: 80, frequencyLimit: '1 per quadrant per 2 years', typicalDuration: 45 },
      { code: 'D4355', category: 'periodontics', description: 'Full mouth debridement to enable comprehensive evaluation', defaultFee: 175, typicalCoverage: 80, frequencyLimit: '1 per lifetime', typicalDuration: 60 },
      { code: 'D4910', category: 'periodontics', description: 'Periodontal maintenance', defaultFee: 145, typicalCoverage: 80, frequencyLimit: '4 per year', typicalDuration: 60 },

      // Prosthodontics Removable (D5000-D5899)
      { code: 'D5110', category: 'prosthodontics_removable', description: 'Complete denture - maxillary', defaultFee: 1650, typicalCoverage: 50, typicalDuration: 120 },
      { code: 'D5120', category: 'prosthodontics_removable', description: 'Complete denture - mandibular', defaultFee: 1650, typicalCoverage: 50, typicalDuration: 120 },
      { code: 'D5213', category: 'prosthodontics_removable', description: 'Maxillary partial denture - cast metal framework with resin denture bases', defaultFee: 1850, typicalCoverage: 50, typicalDuration: 120 },
      { code: 'D5214', category: 'prosthodontics_removable', description: 'Mandibular partial denture - cast metal framework with resin denture bases', defaultFee: 1850, typicalCoverage: 50, typicalDuration: 120 },

      // Prosthodontics Fixed (D6000-D6199)
      { code: 'D6010', category: 'prosthodontics_fixed', description: 'Surgical placement of implant body: endosteal implant', defaultFee: 2200, typicalCoverage: 50, typicalDuration: 90 },
      { code: 'D6058', category: 'prosthodontics_fixed', description: 'Abutment supported porcelain/ceramic crown', defaultFee: 1450, typicalCoverage: 50, typicalDuration: 90 },
      { code: 'D6240', category: 'prosthodontics_fixed', description: 'Pontic - porcelain fused to high noble metal', defaultFee: 1100, typicalCoverage: 50, typicalDuration: 60 },

      // Oral Surgery (D7000-D7999)
      { code: 'D7140', category: 'oral_surgery', description: 'Extraction, erupted tooth or exposed root', defaultFee: 175, typicalCoverage: 80, typicalDuration: 30 },
      { code: 'D7210', category: 'oral_surgery', description: 'Extraction, erupted tooth requiring removal of bone and/or sectioning of tooth', defaultFee: 275, typicalCoverage: 80, typicalDuration: 45 },
      { code: 'D7220', category: 'oral_surgery', description: 'Removal of impacted tooth - soft tissue', defaultFee: 325, typicalCoverage: 80, typicalDuration: 45 },
      { code: 'D7230', category: 'oral_surgery', description: 'Removal of impacted tooth - partially bony', defaultFee: 425, typicalCoverage: 80, typicalDuration: 60 },
      { code: 'D7240', category: 'oral_surgery', description: 'Removal of impacted tooth - completely bony', defaultFee: 525, typicalCoverage: 80, typicalDuration: 75 },

      // Adjunctive General Services (D9000-D9999)
      { code: 'D9110', category: 'adjunctive', description: 'Palliative (emergency) treatment of dental pain - minor procedure', defaultFee: 95, typicalCoverage: 100, typicalDuration: 20 },
      { code: 'D9215', category: 'adjunctive', description: 'Local anesthesia in addition to operative or surgical procedure', defaultFee: 45, typicalCoverage: 100, typicalDuration: 5 },
      { code: 'D9310', category: 'adjunctive', description: 'Consultation - diagnostic service provided by dentist or physician other than requesting dentist or physician', defaultFee: 95, typicalCoverage: 100, typicalDuration: 30 },
      { code: 'D9440', category: 'adjunctive', description: 'Office visit - after regularly scheduled hours', defaultFee: 75, typicalCoverage: 100, typicalDuration: 15 },
    ];

    let created = 0;
    for (const codeData of standardCodes) {
      const existing = await this.prisma.procedureCode.findFirst({
        where: { tenantId, code: codeData.code },
      });

      if (!existing) {
        await this.prisma.procedureCode.create({
          data: {
            tenantId,
            ...codeData,
            version: '2026',
            isActive: true,
          },
        });
        created++;
      }
    }

    this.logger.log(`Seeded ${created} standard CDT codes for tenant ${tenantId}`);

    return { seeded: created, total: standardCodes.length };
  }
}
