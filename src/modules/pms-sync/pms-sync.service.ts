/**
 * CrownDesk V2 - PMS Sync Service
 * Per plan.txt Section 10: PMS Integration
 * Bi-directional sync with Open Dental (and future PMS systems)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OpenDentalAdapter } from './adapters/open-dental.adapter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriberRelation } from '@prisma/client';

export interface SyncResult {
  created: number;
  updated: number;
  errors: number;
}

@Injectable()
export class PmsSyncService {
  private readonly logger = new Logger(PmsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openDental: OpenDentalAdapter,
  ) {}

  /**
   * Check if PMS sync is configured
   */
  isConfigured(): boolean {
    return this.openDental.isConfigured();
  }

  /**
   * Sync patients from PMS to CrownDesk
   * Uses watermark for incremental sync
   */
  async syncPatientsFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping patient sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const watermark = await this.getWatermark(tenantId, 'patient');
    const patients = await this.openDental.fetchPatients(watermark?.lastSyncedAt);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const pmsPatient of patients) {
      try {
        const mapping = await this.prisma.pmsMapping.findFirst({
          where: { tenantId, pmsSource: 'open_dental', entityType: 'patient', pmsId: pmsPatient.pmsId },
        });

        if (mapping) {
          // Update existing patient
          await this.prisma.patient.update({
            where: { id: mapping.crownDeskId },
            data: {
              firstName: pmsPatient.firstName,
              lastName: pmsPatient.lastName,
              middleName: pmsPatient.middleName,
              email: pmsPatient.email,
              phone: pmsPatient.phone,
              mobilePhone: pmsPatient.mobilePhone,
              workPhone: pmsPatient.workPhone,
              address: pmsPatient.address ? {
                street: pmsPatient.address,
                city: pmsPatient.city,
                state: pmsPatient.state,
                zip: pmsPatient.zip,
              } : undefined,
            },
          });
          updated++;
        } else {
          // Create new patient and mapping
          const patient = await this.prisma.patient.create({
            data: {
              tenantId,
              firstName: pmsPatient.firstName,
              lastName: pmsPatient.lastName,
              middleName: pmsPatient.middleName,
              dob: pmsPatient.dateOfBirth,
              email: pmsPatient.email,
              phone: pmsPatient.phone,
              mobilePhone: pmsPatient.mobilePhone,
              workPhone: pmsPatient.workPhone,
              address: pmsPatient.address ? {
                street: pmsPatient.address,
                city: pmsPatient.city,
                state: pmsPatient.state,
                zip: pmsPatient.zip,
              } : undefined,
              pmsSource: 'open_dental',
              pmsPatientId: pmsPatient.pmsId,
            },
          });

          await this.prisma.pmsMapping.create({
            data: {
              tenantId,
              pmsSource: 'open_dental',
              entityType: 'patient',
              pmsId: pmsPatient.pmsId,
              crownDeskId: patient.id,
              lastSyncedAt: new Date(),
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing patient ${pmsPatient.pmsId}: ${error.message}`);
        errors++;
      }
    }

    await this.updateWatermark(tenantId, 'patient');
    this.logger.log(`Patient sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Sync appointments from PMS to CrownDesk
   */
  async syncAppointmentsFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping appointment sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const watermark = await this.getWatermark(tenantId, 'appointment');
    const appointments = await this.openDental.fetchAppointments(watermark?.lastSyncedAt);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const pmsAppt of appointments) {
      try {
        // Find patient mapping
        const patientMapping = await this.prisma.pmsMapping.findFirst({
          where: {
            tenantId,
            pmsSource: 'open_dental',
            entityType: 'patient',
            pmsId: pmsAppt.patientPmsId,
          },
        });

        if (!patientMapping) {
          this.logger.warn(`Patient not found for PMS ID ${pmsAppt.patientPmsId}, skipping appointment`);
          errors++;
          continue;
        }

        const mapping = await this.prisma.pmsMapping.findFirst({
          where: { tenantId, pmsSource: 'open_dental', entityType: 'appointment', pmsId: pmsAppt.pmsId },
        });

        if (mapping) {
          await this.prisma.appointment.update({
            where: { id: mapping.crownDeskId },
            data: {
              startTime: pmsAppt.startTime,
              endTime: pmsAppt.endTime,
              status: pmsAppt.status,
              notes: pmsAppt.notes,
              provider: pmsAppt.provider,
            },
          });
          updated++;
        } else {
          const appointment = await this.prisma.appointment.create({
            data: {
              tenantId,
              patientId: patientMapping.crownDeskId,
              provider: pmsAppt.provider || 'Unknown',
              startTime: pmsAppt.startTime,
              endTime: pmsAppt.endTime,
              status: pmsAppt.status,
              notes: pmsAppt.notes,
              pmsAppointmentId: pmsAppt.pmsId,
            },
          });

          await this.prisma.pmsMapping.create({
            data: {
              tenantId,
              pmsSource: 'open_dental',
              entityType: 'appointment',
              pmsId: pmsAppt.pmsId,
              crownDeskId: appointment.id,
              lastSyncedAt: new Date(),
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing appointment ${pmsAppt.pmsId}: ${error.message}`);
        errors++;
      }
    }

    await this.updateWatermark(tenantId, 'appointment');
    this.logger.log(`Appointment sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Sync insurance from PMS to CrownDesk
   */
  async syncInsuranceFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping insurance sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const watermark = await this.getWatermark(tenantId, 'insurance');
    const plans = await this.openDental.fetchInsurancePlans(watermark?.lastSyncedAt);
    const subscriptions = await this.openDental.fetchInsuranceSubscriptions();

    let created = 0;
    let updated = 0;
    let errors = 0;

    // First, cache plan mappings (plan PMS ID -> plan data)
    const planMap = new Map(plans.map(p => [p.pmsId, p]));

    for (const sub of subscriptions) {
      try {
        const plan = planMap.get(sub.planPmsId);
        if (!plan) {
          this.logger.warn(`Insurance plan not found for PMS ID ${sub.planPmsId}`);
          continue;
        }

        // Find patient mapping
        const patientMapping = await this.prisma.pmsMapping.findFirst({
          where: {
            tenantId,
            pmsSource: 'open_dental',
            entityType: 'patient',
            pmsId: sub.patientPmsId,
          },
        });

        if (!patientMapping) {
          this.logger.warn(`Patient not found for PMS ID "${sub.patientPmsId}" (InsSubNum: ${sub.pmsId}), skipping insurance`);
          continue;
        }

        // Check for existing policy mapping
        const mapping = await this.prisma.pmsMapping.findFirst({
          where: { 
            tenantId, 
            pmsSource: 'open_dental', 
            entityType: 'insurance_policy', 
            pmsId: sub.pmsId 
          },
        });

        const policyData = {
          payerName: plan.carrierName,
          payerId: plan.payerId || '',
          planName: plan.groupName,
          groupNumber: plan.groupNumber,
          memberId: sub.subscriberId,
          effectiveDate: sub.dateEffective,
          terminationDate: sub.dateTerminated,
          subscriberRelation: this.mapRelationToPrisma(sub.relationship) as SubscriberRelation,
        };

        if (mapping) {
          await this.prisma.insurancePolicy.update({
            where: { id: mapping.crownDeskId },
            data: policyData,
          });
          updated++;
        } else {
          const policy = await this.prisma.insurancePolicy.create({
            data: {
              tenantId,
              patientId: patientMapping.crownDeskId,
              isPrimary: true, // Would need logic to determine
              ...policyData,
            },
          });

          await this.prisma.pmsMapping.create({
            data: {
              tenantId,
              pmsSource: 'open_dental',
              entityType: 'insurance_policy',
              pmsId: sub.pmsId,
              crownDeskId: policy.id,
              lastSyncedAt: new Date(),
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing insurance ${sub.pmsId}: ${error.message}`);
        errors++;
      }
    }

    await this.updateWatermark(tenantId, 'insurance');
    this.logger.log(`Insurance sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  private mapRelationToPrisma(relation?: string): string {
    const relationMap: Record<string, string> = {
      self: 'self',
      spouse: 'spouse',
      child: 'child',
      dependent: 'child',
      employee: 'self',
    };
    return relation ? (relationMap[relation] || 'other') : 'self';
  }

  /**
   * Push a CrownDesk patient to PMS
   */
  async pushPatientToPms(tenantId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    const pmsId = await this.openDental.pushPatient(patient);

    await this.prisma.pmsMapping.create({
      data: {
        tenantId,
        pmsSource: 'open_dental',
        entityType: 'patient',
        pmsId,
        crownDeskId: patientId,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Patient ${patientId} pushed to PMS with ID ${pmsId}`);
  }

  async getSyncStatus(tenantId: string) {
    const watermarks = await this.prisma.syncWatermark.findMany({
      where: { tenantId },
    });

    return watermarks.reduce((acc: any, wm: any) => {
      acc[wm.entityType] = wm.lastSyncedAt;
      return acc;
    }, {} as Record<string, Date | null>);
  }

  /**
   * Get sync status list formatted for frontend
   */
  async getSyncStatusList(tenantId: string) {
    const watermarks = await this.prisma.syncWatermark.findMany({
      where: { tenantId },
    });

    const entityTypes = ['patient', 'appointment', 'insurance_policy', 'ledger'];
    
    // Get record counts for each entity type
    const [patientCount, appointmentCount, insuranceCount] = await Promise.all([
      this.prisma.patient.count({ where: { tenantId } }),
      this.prisma.appointment.count({ where: { tenantId } }),
      this.prisma.insurancePolicy.count({ where: { tenantId } }),
    ]);

    const recordCounts: Record<string, number> = {
      patient: patientCount,
      appointment: appointmentCount,
      insurance_policy: insuranceCount,
      ledger: 0,
    };

    return entityTypes.map(entityType => {
      const watermark = watermarks.find(wm => wm.entityType === entityType);
      return {
        entityType,
        lastSyncAt: watermark?.lastSyncedAt?.toISOString() || null,
        status: watermark?.lastSyncedAt ? 'synced' : 'never',
        recordCount: recordCounts[entityType] || 0,
      };
    });
  }

  /**
   * Get sync configuration
   */
  async getSyncConfig(tenantId: string) {
    const latestSync = await this.prisma.syncWatermark.findFirst({
      where: { tenantId },
      orderBy: { lastSyncedAt: 'desc' },
    });

    return {
      pmsSource: 'open_dental',
      autoSync: !!process.env.OPEN_DENTAL_API_KEY,
      syncIntervalMinutes: 15,
      lastFullSync: latestSync?.lastSyncedAt?.toISOString() || null,
    };
  }

  /**
   * Get PMS mappings
   */
  async getMappings(tenantId: string) {
    const mappings = await this.prisma.pmsMapping.findMany({
      where: { tenantId },
      orderBy: { lastSyncedAt: 'desc' },
      take: 100,
    });

    return mappings.map(m => ({
      id: m.id,
      entityType: m.entityType,
      pmsId: m.pmsId,
      localId: m.crownDeskId,
      syncedAt: m.lastSyncedAt.toISOString(),
    }));
  }

  /**
   * Trigger sync for specific entity type
   */
  async triggerSync(tenantId: string, entityType: string): Promise<SyncResult | { message: string }> {
    switch (entityType) {
      case 'procedure_code':
      case 'cdt_code':
        return this.syncProcedureCodesFromPms(tenantId);
      case 'family':
      case 'families':
        return this.syncFamiliesFromPms(tenantId);
      case 'provider':
        return this.syncProvidersFromPms(tenantId);
      case 'operatory':
        return this.syncOperatoriesFromPms(tenantId);
      case 'patient':
        return this.syncPatientsFromPms(tenantId);
      case 'appointment':
        return this.syncAppointmentsFromPms(tenantId);
      case 'insurance':
      case 'insurance_policy':
        return this.syncInsuranceFromPms(tenantId);
      case 'procedure':
      case 'completed_procedure':
        return this.syncProceduresFromPms(tenantId);
      default:
        return { message: `Sync not implemented for ${entityType}` };
    }
  }

  /**
   * Sync completed procedures from PMS to CrownDesk
   * This is critical for billing - treatments done by doctors flow back here
   */
  async syncProceduresFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping procedure sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const watermark = await this.getWatermark(tenantId, 'procedure');
    const procedures = await this.openDental.fetchProcedures(watermark?.lastSyncedAt);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const proc of procedures) {
      try {
        // Skip non-completed procedures (we only want treatments actually done)
        if (proc.procStatus !== 'completed') {
          continue;
        }

        // Find patient mapping
        const patientMapping = await this.prisma.pmsMapping.findFirst({
          where: {
            tenantId,
            pmsSource: 'open_dental',
            entityType: 'patient',
            pmsId: proc.patientPmsId,
          },
        });

        if (!patientMapping) {
          this.logger.warn(`Patient not found for PMS ID ${proc.patientPmsId}, skipping procedure`);
          continue;
        }

        // Check for existing procedure mapping
        const existingProc = await this.prisma.completedProcedure.findFirst({
          where: {
            tenantId,
            pmsSource: 'open_dental',
            pmsProcedureId: proc.pmsId,
          },
        });

        const procedureData = {
          cdtCode: proc.cdtCode,
          description: proc.description,
          procDate: proc.procDate,
          toothNumber: proc.toothNum,
          surface: proc.surface,
          fee: proc.procFee,
          status: 'completed' as const,
          providerName: proc.providerId,
          note: proc.note,
          diagCode: proc.diagCode,
          dateComplete: proc.dateComplete,
          lastSyncedAt: new Date(),
        };

        if (existingProc) {
          // Update existing procedure
          await this.prisma.completedProcedure.update({
            where: { id: existingProc.id },
            data: procedureData,
          });
          updated++;
        } else {
          // Create new completed procedure
          await this.prisma.completedProcedure.create({
            data: {
              tenantId,
              patientId: patientMapping.crownDeskId,
              pmsSource: 'open_dental',
              pmsProcedureId: proc.pmsId,
              ...procedureData,
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing procedure ${proc.pmsId}: ${error.message}`);
        errors++;
      }
    }

    if (created > 0 || updated > 0) {
      await this.updateWatermark(tenantId, 'procedure');
    }

    this.logger.log(`Procedure sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Sync providers from PMS to CrownDesk
   */
  async syncProvidersFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping provider sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const providers = await this.openDental.fetchProviders();

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const provider of providers) {
      try {
        // Check if provider exists
        const existingProvider = await this.prisma.provider.findFirst({
          where: {
            tenantId,
            pmsProviderId: provider.provNum?.toString(),
          },
        });

        const providerData = {
          firstName: provider.firstName || '',
          lastName: provider.lastName || '',
          npi: provider.npi,
          license: provider.stateLicense,
          specialty: 'general_dentist' as const, // Default, can be enhanced
          isActive: provider.isHidden === false || provider.isHidden === undefined,
          pmsProviderId: provider.provNum?.toString(),
        };

        if (existingProvider) {
          await this.prisma.provider.update({
            where: { id: existingProvider.id },
            data: providerData,
          });
          updated++;
        } else {
          await this.prisma.provider.create({
            data: {
              tenantId,
              ...providerData,
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing provider: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Provider sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Sync procedure codes (CDT codes) from PMS to CrownDesk
   * These are the standard dental procedure codes used for billing
   */
  async syncProcedureCodesFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping procedure code sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const codes = await this.openDental.fetchProcedureCodes();

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const code of codes) {
      try {
        // Check if code exists
        const existingCode = await this.prisma.procedureCode.findFirst({
          where: {
            tenantId,
            code: code.code,
          },
        });

        // Map category from Open Dental to our enum
        const category = this.mapProcedureCategory(code.category);

        const codeData = {
          code: code.code,
          category,
          description: code.description,
          abbreviation: code.abbreviation,
          defaultFee: code.defaultFee || 0,
          typicalDuration: this.parseProcedureTime(code.procTime),
          isActive: true,
        };

        if (existingCode) {
          await this.prisma.procedureCode.update({
            where: { id: existingCode.id },
            data: codeData,
          });
          updated++;
        } else {
          await this.prisma.procedureCode.create({
            data: {
              tenantId,
              ...codeData,
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing procedure code ${code.code}: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Procedure code sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Sync family accounts from PMS to CrownDesk
   * Family accounts group patients for billing purposes
   * Uses Open Dental's official accountmodules API (Version 22.1+)
   */
  async syncFamiliesFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping family sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    this.logger.log(`[Family Sync] Starting for tenant ${tenantId}`);

    // Get all patients from CrownDesk
    const patients = await this.prisma.patient.findMany({
      where: { 
        tenantId,
        pmsSource: 'open_dental',
        pmsPatientId: { not: null },
      },
    });

    if (patients.length === 0) {
      this.logger.warn('No patients found, skipping family sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    let created = 0;
    let updated = 0;
    let errors = 0;

    const processedFamilies = new Set<string>(); // Track processed guarantor IDs

    for (const patient of patients) {
      const pmsPatNum = patient.pmsPatientId;
      if (!pmsPatNum) continue;

      // Skip if we already processed this family
      if (processedFamilies.has(pmsPatNum)) continue;

      try {
        // Call Open Dental accountmodules endpoint to get family members
        const familyData = await this.openDental.fetchFamilyMembers(pmsPatNum);
        
        const { guarantorPmsId, memberPmsIds, totalBalance } = familyData;

        // Mark all members as processed
        memberPmsIds.forEach((id) => processedFamilies.add(id));

        // Skip single-patient "families"
        if (memberPmsIds.length < 2) {
          this.logger.debug(`Patient ${pmsPatNum} is a single-member family, skipping`);
          continue;
        }

        // Find guarantor patient in CrownDesk
        const guarantor = await this.prisma.patient.findFirst({
          where: {
            pmsPatientId: guarantorPmsId,
            pmsSource: 'open_dental',
            tenantId,
          },
        });

        if (!guarantor) {
          this.logger.warn(`Guarantor ${guarantorPmsId} not found in CrownDesk, skipping family`);
          continue;
        }

        // Check if family already exists
        const existingFamily = await this.prisma.family.findFirst({
          where: {
            tenantId,
            guarantorId: guarantor.id,
          },
        });

        let family;
        if (existingFamily) {
          // Update existing family
          family = await this.prisma.family.update({
            where: { id: existingFamily.id },
            data: {
              name: `${guarantor.lastName} Family`,
              updatedAt: new Date(),
            },
          });
          updated++;
          this.logger.debug(`Updated family ${existingFamily.id} for guarantor ${guarantorPmsId}`);
        } else {
          // Create new family
          family = await this.prisma.family.create({
            data: {
              tenantId,
              name: `${guarantor.lastName} Family`,
              guarantorId: guarantor.id,
            },
          });
          created++;
          this.logger.log(`Created family ${family.id} for guarantor ${guarantorPmsId} with ${memberPmsIds.length} members`);
        }

        // Update all family members with familyId and guarantorId
        for (const memberPmsId of memberPmsIds) {
          await this.prisma.patient.updateMany({
            where: {
              pmsPatientId: memberPmsId,
              pmsSource: 'open_dental',
              tenantId,
            },
            data: {
              familyId: family.id,
              guarantorId: guarantor.id,
            },
          });
        }

        this.logger.debug(
          `Family ${family.id}: ${memberPmsIds.length} members linked, total balance: $${totalBalance}`
        );
      } catch (error: any) {
        this.logger.error(`Error syncing family for patient ${pmsPatNum}: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`[Family Sync] Complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Sync operatories from PMS to CrownDesk
   */
  async syncOperatoriesFromPms(tenantId: string): Promise<SyncResult> {
    if (!this.isConfigured()) {
      this.logger.warn('PMS not configured, skipping operatory sync');
      return { created: 0, updated: 0, errors: 0 };
    }

    const operatories = await this.openDental.fetchOperatories();

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const operatory of operatories) {
      try {
        // Check if operatory exists
        const existingOperatory = await this.prisma.operatory.findFirst({
          where: {
            tenantId,
            pmsOperatoryId: operatory.operatoryNum?.toString(),
          },
        });

        const operatoryData = {
          name: operatory.opName || '',
          shortName: operatory.abbrev,
          isActive: !operatory.isHidden,
          pmsOperatoryId: operatory.operatoryNum?.toString(),
        };

        if (existingOperatory) {
          await this.prisma.operatory.update({
            where: { id: existingOperatory.id },
            data: operatoryData,
          });
          updated++;
        } else {
          await this.prisma.operatory.create({
            data: {
              tenantId,
              ...operatoryData,
            },
          });
          created++;
        }
      } catch (error: any) {
        this.logger.error(`Error syncing operatory: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Operatory sync complete: ${created} created, ${updated} updated, ${errors} errors`);
    return { created, updated, errors };
  }

  /**
   * Full sync all entities
   * Order matters: procedure codes first (referenced by procedures),
   * then providers/operatories, then patients, then everything else
   * 
   * This runs asynchronously in background and may take 30-120 seconds
   */
  async fullSync(tenantId: string) {
    const startTime = Date.now();
    this.logger.log(`[Full Sync] Starting for tenant ${tenantId}`);
    
    const results = {
      procedureCodes: await this.syncProcedureCodesFromPms(tenantId),
      providers: await this.syncProvidersFromPms(tenantId),
      operatories: await this.syncOperatoriesFromPms(tenantId),
      patients: await this.syncPatientsFromPms(tenantId),
      families: await this.syncFamiliesFromPms(tenantId),
      appointments: await this.syncAppointmentsFromPms(tenantId),
      insurance: await this.syncInsuranceFromPms(tenantId),
      procedures: await this.syncProceduresFromPms(tenantId),
    };
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    this.logger.log(`[Full Sync] Complete for tenant ${tenantId} in ${duration}s - Results:`, JSON.stringify(results, null, 2));
    return results;
  }

  /**
   * Scheduled sync - runs every 15 minutes
   * Only syncs tenants that have PMS configured
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledSync() {
    if (!this.isConfigured()) {
      return; // Skip if PMS not configured
    }

    this.logger.log('Running scheduled PMS sync');
    
    try {
      // Get all tenants with PMS source configured
      const tenants = await this.prisma.tenant.findMany({
        where: {
          status: 'active',
        },
        select: { id: true },
      });

      for (const tenant of tenants) {
        try {
          await this.fullSync(tenant.id);
        } catch (error: any) {
          this.logger.error(`Scheduled sync failed for tenant ${tenant.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Scheduled sync failed: ${error.message}`);
    }
  }

  private async getWatermark(tenantId: string, entityType: string) {
    return this.prisma.syncWatermark.findFirst({
      where: { tenantId, entityType, pmsSource: 'open_dental' },
    });
  }

  private async updateWatermark(tenantId: string, entityType: string) {
    await this.prisma.syncWatermark.upsert({
      where: {
        tenantId_pmsSource_entityType: { tenantId, pmsSource: 'open_dental', entityType },
      },
      create: {
        tenantId,
        pmsSource: 'open_dental',
        entityType,
        lastSyncedAt: new Date(),
      },
      update: {
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Map Open Dental procedure category to our CDT category enum
   */
  private mapProcedureCategory(category?: string): any {
    if (!category) return 'adjunctive';
    
    const lowerCategory = category.toLowerCase();
    
    if (lowerCategory.includes('diagn')) return 'diagnostic';
    if (lowerCategory.includes('prevent')) return 'preventive';
    if (lowerCategory.includes('restor')) return 'restorative';
    if (lowerCategory.includes('endo')) return 'endodontics';
    if (lowerCategory.includes('perio')) return 'periodontics';
    if (lowerCategory.includes('prostho')) {
      if (lowerCategory.includes('remov')) return 'prosthodontics_removable';
      return 'prosthodontics_fixed';
    }
    if (lowerCategory.includes('surg')) return 'oral_surgery';
    if (lowerCategory.includes('ortho')) return 'orthodontics';
    
    return 'adjunctive';
  }

  /**
   * Parse Open Dental procedure time format to minutes
   */
  private parseProcedureTime(procTime?: string): number | undefined {
    if (!procTime) return undefined;
    
    // Open Dental format: "00:30:00" for 30 minutes
    const parts = procTime.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    }
    
    return undefined;
  }
}
