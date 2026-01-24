/**
 * PA 278 EDI Builder
 * Builds Health Care Services Review (Prior Authorization) in 278 format for Stedi submission
 * 
 * Format: ANSI ASC X12 5010 - Version 278 (Health Care Services Review - Request)
 * Reference: https://www.stedi.com/edi/hipaa/transaction-set/278
 * 
 * Per CMS 2025 Electronic Prior Authorization Rule:
 * - Urgent requests: 72 hours response
 * - Standard requests: 7 calendar days response
 */

// ==========================================
// REQUEST TYPE CODES (UM01)
// ==========================================
export type RequestTypeCode = 'HS' | 'AR' | 'SC';
// HS = Health Services Review Request
// AR = Admission Review
// SC = Specialty Care Review

// ==========================================
// CERTIFICATION TYPE CODES (UM02)
// ==========================================
export type CertificationTypeCode = 'I' | 'R' | 'E' | 'A';
// I = Initial
// R = Renewal
// E = Extension
// A = Appeal

// ==========================================
// SERVICE TYPE CODES FOR DENTAL (UM03)
// ==========================================
export type ServiceTypeCode = '35' | '36' | '37' | '38';
// 35 = Dental Care
// 36 = Dental Crowns
// 37 = Dental Accident
// 38 = Orthodontics

// ==========================================
// LEVEL OF SERVICE CODES (UM05)
// ==========================================
export type LevelOfServiceCode = 'U' | 'E';
// U = Urgent (72-hour CMS turnaround)
// E = Elective (7-day standard)

// ==========================================
// ORAL CAVITY DESIGNATION CODES (SV311)
// ==========================================
export type OralCavityCode = '00' | '01' | '02' | '10' | '20' | '30' | '40';
// 00 = Entire Oral Cavity
// 01 = Maxillary Area
// 02 = Mandibular Area
// 10 = Upper Right Quadrant
// 20 = Upper Left Quadrant
// 30 = Lower Left Quadrant
// 40 = Lower Right Quadrant

// ==========================================
// TOOTH SURFACE CODES
// ==========================================
export type ToothSurfaceCode = 'M' | 'O' | 'D' | 'B' | 'L' | 'I' | 'F';
// M = Mesial
// O = Occlusal
// D = Distal
// B = Buccal
// L = Lingual
// I = Incisal
// F = Facial

// ==========================================
// RESPONSE ACTION CODES (HCR01) - for parsing responses
// ==========================================
export type ActionCode = 'A1' | 'A2' | 'A3' | 'A4' | 'A6' | 'C' | 'CT' | 'D' | 'IP' | 'NA';
// A1 = Certified in total (approved)
// A2 = Certified - partial approval
// A3 = Not certified (denied)
// A4 = Pended (additional info required)
// A6 = Modified
// C = Canceled
// CT = Contact payer
// D = Deferred
// IP = In Process
// NA = No Action Required

// ==========================================
// INPUT DATA INTERFACE
// ==========================================
export interface PA278Data {
  // Submitter Information (Practice)
  submitter: {
    organizationName: string;
    taxId: string;
    npi: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    contactFax?: string;
  };

  // Payer (Insurance Company / UMO)
  payer: {
    name: string;
    payerId: string;  // Stedi Payer ID
  };

  // Requesting Provider (Dentist submitting PA)
  requestingProvider: {
    organizationName?: string;
    firstName?: string;
    lastName?: string;
    npi: string;
    taxonomyCode?: string;  // 1223D0001X = General Dentist
    address?: {
      street1: string;
      city: string;
      state: string;
      zip: string;
    };
    phone?: string;
    fax?: string;
  };

  // Subscriber (Insurance Policy Holder)
  subscriber: {
    memberId: string;
    groupNumber?: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;  // YYYY-MM-DD
    gender: 'M' | 'F' | 'U';
    relationshipCode: '18' | '01' | '19' | '20' | '21' | '39' | '40' | '53';
    // 18=Self, 01=Spouse, 19=Child, 20=Employee, 21=Unknown
    address?: {
      street1: string;
      city: string;
      state: string;
      zip: string;
    };
  };

  // Patient (if different from subscriber)
  patient?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: 'M' | 'F' | 'U';
    relationshipToSubscriber: '01' | '19' | '20' | '21' | '39' | '40' | '53';
    patientAccountNumber?: string;
  };

  // Authorization Request Details
  authorization: {
    requestId: string;  // Internal PA ID / Trace Number
    requestTypeCode: RequestTypeCode;
    certificationTypeCode: CertificationTypeCode;
    serviceTypeCode: ServiceTypeCode;
    levelOfServiceCode?: LevelOfServiceCode;
    serviceDate: string;  // YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD for range
    diagnosisCodes?: string[];  // ICD-10 codes
  };

  // Procedures being requested
  procedures: Array<{
    cdtCode: string;  // D0120, D2740, etc.
    description?: string;
    fee: number;
    quantity: number;
    toothNumbers?: string[];  // '1'-'32' or 'A'-'T'
    surfaces?: ToothSurfaceCode[];
    oralCavityCode?: OralCavityCode;
    dateOfService?: string;  // Override if different from authorization date
    clinicalNote?: string;
  }>;

  // Supporting Documentation
  attachments?: Array<{
    type: 'DG' | 'OZ' | 'DA';  // DG=Diagnostic, OZ=Other, DA=Dental Models
    transmissionType: 'EL' | 'AA' | 'BM';  // EL=Electronic, AA=Available, BM=By Mail
    controlNumber?: string;
    description?: string;
  }>;

  // Clinical Narrative
  narrative?: string;

  // Rendering Provider (if different from requesting)
  renderingProvider?: {
    firstName?: string;
    lastName?: string;
    npi: string;
  };
}

// ==========================================
// 278 BUILDER CLASS
// ==========================================
export class PA278Builder {
  /**
   * Build 278 EDI payload for Stedi prior authorization submission
   */
  static build(data: PA278Data): object {
    const controlNumber = this.generateControlNumber();
    const currentDate = new Date();

    return {
      // Interchange Control Header (ISA)
      interchangeControlHeader: {
        authorizationInformationQualifier: '00',
        authorizationInformation: '          ',
        securityInformationQualifier: '00',
        securityInformation: '          ',
        senderIdQualifier: 'ZZ',
        senderId: this.padRight(data.submitter.npi || data.submitter.taxId.replace(/\D/g, ''), 15),
        receiverIdQualifier: 'ZZ',
        receiverId: this.padRight(data.payer.payerId, 15),
        interchangeDate: this.formatDate(currentDate, 'YYMMDD'),
        interchangeTime: this.formatDate(currentDate, 'HHmm'),
        interchangeControlStandardsIdentifier: '^',
        interchangeControlVersionNumber: '00501',
        interchangeControlNumber: controlNumber.slice(0, 9),
        acknowledgmentRequested: '0',
        usageIndicator: 'T',  // T=Test, P=Production
        componentElementSeparator: ':',
      },

      // Functional Group Header (GS) - HI for Health Care Services Review
      functionalGroupHeader: {
        functionalIdentifierCode: 'HI',  // Health Care Services Review
        applicationSendersCode: data.submitter.npi || data.submitter.taxId.replace(/\D/g, ''),
        applicationReceiversCode: data.payer.payerId,
        date: this.formatDate(currentDate, 'YYYYMMDD'),
        time: this.formatDate(currentDate, 'HHmm'),
        groupControlNumber: controlNumber,
        responsibleAgencyCode: 'X',
        versionReleaseIndustryIdentifierCode: '005010X217',  // 278 Request version
      },

      // Transaction Set Header (ST)
      transactionSetHeader: {
        transactionSetIdentifierCode: '278',
        transactionSetControlNumber: data.authorization.requestId.slice(0, 9),
        implementationConventionReference: '005010X217',
      },

      // Beginning of Hierarchical Transaction (BHT)
      beginningOfHierarchicalTransaction: {
        hierarchicalStructureCode: '0007',  // Provider to Payer
        transactionSetPurposeCode: '13',    // Request
        referenceIdentification: data.authorization.requestId,
        date: this.formatDate(currentDate, 'YYYYMMDD'),
        time: this.formatDate(currentDate, 'HHmm'),
        transactionTypeCode: 'DG',  // Health Services Review
      },

      // Loop 2000A - Utilization Management Organization (Payer)
      umo: this.buildLoop2000A(data),

      // Loop 2000B - Requester (Requesting Provider)
      requester: this.buildLoop2000B(data),

      // Loop 2000C - Subscriber
      subscriber: this.buildLoop2000C(data),

      // Loop 2000D - Dependent (if patient is different from subscriber)
      dependent: data.patient ? this.buildLoop2000D(data) : undefined,

      // Loop 2000E - Patient Event (Authorization Details)
      patientEvent: this.buildLoop2000E(data),

      // Loop 2000F - Services (Procedures)
      services: this.buildLoop2000F(data),

      // Transaction Set Trailer (SE)
      transactionSetTrailer: {
        numberOfIncludedSegments: this.calculateSegmentCount(data),
        transactionSetControlNumber: data.authorization.requestId.slice(0, 9),
      },

      // Functional Group Trailer (GE)
      functionalGroupTrailer: {
        numberOfTransactionSetsIncluded: '1',
        groupControlNumber: controlNumber,
      },

      // Interchange Control Trailer (IEA)
      interchangeControlTrailer: {
        numberOfIncludedFunctionalGroups: '1',
        interchangeControlNumber: controlNumber.slice(0, 9),
      },
    };
  }

  /**
   * Build Loop 2000A - UMO (Payer)
   */
  private static buildLoop2000A(data: PA278Data): object {
    return {
      hierarchicalLevel: {
        hierarchicalIdNumber: '1',
        hierarchicalParentIdNumber: '',
        hierarchicalLevelCode: '20',  // Information Source
        hierarchicalChildCode: '1',   // Has children
      },
      
      umoName: {
        entityIdentifierCode: 'X3',   // UMO Organization
        entityTypeQualifier: '2',     // Non-Person Entity
        organizationName: data.payer.name,
        identificationCodeQualifier: 'PI',  // Payer ID
        identificationCode: data.payer.payerId,
      },
    };
  }

  /**
   * Build Loop 2000B - Requester (Provider)
   */
  private static buildLoop2000B(data: PA278Data): object {
    const isOrganization = !!data.requestingProvider.organizationName;
    
    return {
      hierarchicalLevel: {
        hierarchicalIdNumber: '2',
        hierarchicalParentIdNumber: '1',
        hierarchicalLevelCode: '21',  // Requester
        hierarchicalChildCode: '1',
      },
      
      requesterName: {
        entityIdentifierCode: '1P',   // Provider
        entityTypeQualifier: isOrganization ? '2' : '1',
        organizationName: isOrganization ? data.requestingProvider.organizationName : undefined,
        lastName: !isOrganization ? data.requestingProvider.lastName : undefined,
        firstName: !isOrganization ? data.requestingProvider.firstName : undefined,
        identificationCodeQualifier: 'XX',  // NPI
        identificationCode: data.requestingProvider.npi,
      },
      
      requesterSupplementalId: data.submitter.taxId ? {
        referenceIdentificationQualifier: 'EI',  // Employer ID (Tax ID)
        referenceIdentification: data.submitter.taxId.replace(/\D/g, ''),
      } : undefined,
      
      requesterContactInfo: (data.requestingProvider.phone || data.submitter.contactPhone) ? {
        contactFunctionCode: 'IC',  // Information Contact
        name: data.submitter.contactName || data.requestingProvider.organizationName,
        communicationNumberQualifier1: 'TE',
        communicationNumber1: (data.requestingProvider.phone || data.submitter.contactPhone)?.replace(/\D/g, ''),
        communicationNumberQualifier2: data.requestingProvider.fax ? 'FX' : undefined,
        communicationNumber2: data.requestingProvider.fax?.replace(/\D/g, ''),
      } : undefined,
      
      providerInformation: data.requestingProvider.taxonomyCode ? {
        providerCode: 'PE',  // Performing
        referenceIdentificationQualifier: 'PXC',  // Provider Taxonomy Code
        referenceIdentification: data.requestingProvider.taxonomyCode,
      } : undefined,
    };
  }

  /**
   * Build Loop 2000C - Subscriber
   */
  private static buildLoop2000C(data: PA278Data): object {
    const hasDependent = !!data.patient;
    
    return {
      hierarchicalLevel: {
        hierarchicalIdNumber: '3',
        hierarchicalParentIdNumber: '2',
        hierarchicalLevelCode: '22',  // Subscriber
        hierarchicalChildCode: hasDependent ? '1' : '0',
      },
      
      traceNumber: {
        traceTypeCode: '1',  // Current Transaction
        referenceIdentification: data.authorization.requestId,
        originatingCompanyIdentifier: data.submitter.npi || data.submitter.taxId.replace(/\D/g, ''),
      },
      
      subscriberName: {
        entityIdentifierCode: 'IL',  // Insured/Subscriber
        entityTypeQualifier: '1',    // Person
        lastName: data.subscriber.lastName,
        firstName: data.subscriber.firstName,
        identificationCodeQualifier: 'MI',  // Member ID
        identificationCode: data.subscriber.memberId,
      },
      
      subscriberSupplementalId: data.subscriber.groupNumber ? {
        referenceIdentificationQualifier: '6P',  // Group Number
        referenceIdentification: data.subscriber.groupNumber,
      } : undefined,
      
      subscriberAddress: data.subscriber.address ? {
        addressLine1: data.subscriber.address.street1,
      } : undefined,
      
      subscriberCityStateZip: data.subscriber.address ? {
        cityName: data.subscriber.address.city,
        stateCode: data.subscriber.address.state,
        postalCode: data.subscriber.address.zip.replace(/\D/g, '').substring(0, 9),
      } : undefined,
      
      subscriberDemographics: {
        dateTimePeriodFormatQualifier: 'D8',
        dateTimePeriod: data.subscriber.dateOfBirth.replace(/-/g, ''),
        genderCode: data.subscriber.gender,
      },
    };
  }

  /**
   * Build Loop 2000D - Dependent (Patient if different from subscriber)
   */
  private static buildLoop2000D(data: PA278Data): object | undefined {
    if (!data.patient) return undefined;

    return {
      hierarchicalLevel: {
        hierarchicalIdNumber: '4',
        hierarchicalParentIdNumber: '3',
        hierarchicalLevelCode: '23',  // Dependent
        hierarchicalChildCode: '1',
      },
      
      traceNumber: {
        traceTypeCode: '1',
        referenceIdentification: data.authorization.requestId,
      },
      
      dependentName: {
        entityIdentifierCode: 'QC',  // Patient
        entityTypeQualifier: '1',
        lastName: data.patient.lastName,
        firstName: data.patient.firstName,
      },
      
      dependentSupplementalId: data.patient.patientAccountNumber ? {
        referenceIdentificationQualifier: 'EJ',  // Patient Account Number
        referenceIdentification: data.patient.patientAccountNumber,
      } : undefined,
      
      dependentDemographics: {
        dateTimePeriodFormatQualifier: 'D8',
        dateTimePeriod: data.patient.dateOfBirth.replace(/-/g, ''),
        genderCode: data.patient.gender,
      },
      
      insuranceRelationship: {
        insuredIndicator: 'N',  // Not the subscriber
        relationshipToInsured: data.patient.relationshipToSubscriber,
      },
    };
  }

  /**
   * Build Loop 2000E - Patient Event (Authorization Details)
   */
  private static buildLoop2000E(data: PA278Data): object {
    const parentId = data.patient ? '4' : '3';
    
    return {
      hierarchicalLevel: {
        hierarchicalIdNumber: '5',
        hierarchicalParentIdNumber: parentId,
        hierarchicalLevelCode: 'EV',  // Patient Event
        hierarchicalChildCode: '1',   // Has services
      },
      
      patientEventTraceNumber: {
        traceTypeCode: '1',
        referenceIdentification: data.authorization.requestId,
      },
      
      healthCareServicesReview: {
        requestCategoryCode: data.authorization.requestTypeCode,
        certificationTypeCode: data.authorization.certificationTypeCode,
        serviceTypeCode: data.authorization.serviceTypeCode,
        facilityTypeCode: data.requestingProvider.address ? '11' : undefined,  // Office
        levelOfServiceCode: data.authorization.levelOfServiceCode,
      },
      
      diagnosisCodes: data.authorization.diagnosisCodes && data.authorization.diagnosisCodes.length > 0 ? {
        healthCareCodeInformation: data.authorization.diagnosisCodes.slice(0, 12).map((code, index) => ({
          diagnosisTypeCode: 'ABK',  // ICD-10-CM
          diagnosisCode: code,
          diagnosisPointer: index + 1,
        })),
      } : undefined,
      
      serviceDate: this.buildDateSegment(data.authorization.serviceDate),
      
      patientEventProvider: data.renderingProvider ? {
        entityIdentifierCode: '1P',
        entityTypeQualifier: '1',
        lastName: data.renderingProvider.lastName,
        firstName: data.renderingProvider.firstName,
        identificationCodeQualifier: 'XX',
        identificationCode: data.renderingProvider.npi,
      } : undefined,
    };
  }

  /**
   * Build Loop 2000F - Services (Procedures)
   */
  private static buildLoop2000F(data: PA278Data): object[] {
    return data.procedures.map((proc, index) => ({
      hierarchicalLevel: {
        hierarchicalIdNumber: (6 + index).toString(),
        hierarchicalParentIdNumber: '5',
        hierarchicalLevelCode: 'SS',  // Service
        hierarchicalChildCode: '0',   // No children
      },
      
      serviceTraceNumber: {
        traceTypeCode: '1',
        referenceIdentification: `${data.authorization.requestId}-${index + 1}`,
      },
      
      // SV3 - Dental Service Line (CRITICAL FOR DENTAL)
      dentalService: {
        procedureCodeComposite: {
          productServiceIdQualifier: 'AD',  // ADA CDT Code
          procedureCode: proc.cdtCode,
          description: proc.description,
        },
        monetaryAmount: proc.fee,
        unitBasisCode: 'UN',  // Unit
        quantity: proc.quantity,
        facilityCode: '11',   // Office
        oralCavityDesignation: proc.oralCavityCode,
      },
      
      // TOO - Tooth Information
      toothInformation: proc.toothNumbers && proc.toothNumbers.length > 0 
        ? proc.toothNumbers.map(tooth => ({
            codeListQualifierCode: 'JP',  // Universal Numbering System
            toothCode: tooth,
            toothSurfaces: proc.surfaces?.map(surface => ({
              toothSurfaceCode: surface,
            })),
          }))
        : undefined,
      
      // HSD - Health Care Services Delivery
      servicesDelivery: proc.quantity > 1 ? {
        quantityQualifier: 'UN',  // Units
        quantity: proc.quantity,
      } : undefined,
      
      // PWK - Attachments for this service
      paperwork: data.attachments?.map(att => ({
        reportTypeCode: att.type,
        reportTransmissionCode: att.transmissionType,
        attachmentControlNumber: att.controlNumber,
        attachmentDescription: att.description,
      })),
      
      // MSG - Clinical note
      messageText: proc.clinicalNote || (index === 0 && data.narrative) ? {
        freeFormMessageText: proc.clinicalNote || data.narrative,
      } : undefined,
    }));
  }

  /**
   * Build date segment (handles single date or range)
   */
  private static buildDateSegment(dateString: string): object {
    const hasRange = dateString.includes(' to ') || dateString.includes('-') && dateString.split('-').length > 3;
    
    if (hasRange) {
      const parts = dateString.split(/ to |-(?=\d{4})/);
      return {
        dateTimeQualifier: '472',  // Service
        dateTimePeriodFormatQualifier: 'RD8',  // Range
        dateTimePeriod: `${parts[0].replace(/-/g, '')}-${parts[1].replace(/-/g, '')}`,
      };
    }
    
    return {
      dateTimeQualifier: '472',  // Service
      dateTimePeriodFormatQualifier: 'D8',  // Single
      dateTimePeriod: dateString.replace(/-/g, ''),
    };
  }

  /**
   * Validate PA 278 data before building
   */
  static validate(data: PA278Data): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required submitter fields
    if (!data.submitter.organizationName) errors.push('Submitter organization name is required');
    if (!data.submitter.npi && !data.submitter.taxId) errors.push('Submitter NPI or Tax ID is required');

    // Required payer fields
    if (!data.payer.payerId) errors.push('Payer ID is required');
    if (!data.payer.name) errors.push('Payer name is required');

    // Required requesting provider fields
    if (!data.requestingProvider.npi) errors.push('Requesting provider NPI is required');
    if (!data.requestingProvider.organizationName && !data.requestingProvider.lastName) {
      errors.push('Requesting provider name (organization or individual) is required');
    }

    // Required subscriber fields
    if (!data.subscriber.memberId) errors.push('Subscriber member ID is required');
    if (!data.subscriber.firstName) errors.push('Subscriber first name is required');
    if (!data.subscriber.lastName) errors.push('Subscriber last name is required');
    if (!data.subscriber.dateOfBirth) errors.push('Subscriber date of birth is required');
    if (!this.isValidDate(data.subscriber.dateOfBirth)) {
      errors.push('Subscriber date of birth must be in YYYY-MM-DD format');
    }

    // Required authorization fields
    if (!data.authorization.requestId) errors.push('Authorization request ID is required');
    if (!data.authorization.requestTypeCode) errors.push('Request type code is required');
    if (!data.authorization.certificationTypeCode) errors.push('Certification type code is required');
    if (!data.authorization.serviceTypeCode) errors.push('Service type code is required');
    if (!data.authorization.serviceDate) errors.push('Service date is required');

    // Validate request type code
    if (!['HS', 'AR', 'SC'].includes(data.authorization.requestTypeCode)) {
      errors.push('Request type code must be HS, AR, or SC');
    }

    // Validate certification type code
    if (!['I', 'R', 'E', 'A'].includes(data.authorization.certificationTypeCode)) {
      errors.push('Certification type code must be I, R, E, or A');
    }

    // Validate service type code (dental)
    if (!['35', '36', '37', '38'].includes(data.authorization.serviceTypeCode)) {
      errors.push('Service type code must be 35, 36, 37, or 38 for dental');
    }

    // Validate procedures
    if (!data.procedures || data.procedures.length === 0) {
      errors.push('At least one procedure is required');
    } else {
      data.procedures.forEach((proc, index) => {
        if (!proc.cdtCode) {
          errors.push(`Procedure ${index + 1}: CDT code is required`);
        } else if (!proc.cdtCode.match(/^D\d{4}$/)) {
          errors.push(`Procedure ${index + 1}: Invalid CDT code format (must be D####)`);
        }
        if (proc.fee <= 0) errors.push(`Procedure ${index + 1}: Fee must be greater than zero`);
        if (proc.quantity <= 0) errors.push(`Procedure ${index + 1}: Quantity must be greater than zero`);
        
        // Validate tooth numbers if provided
        if (proc.toothNumbers) {
          proc.toothNumbers.forEach(tooth => {
            if (!this.isValidToothNumber(tooth)) {
              errors.push(`Procedure ${index + 1}: Invalid tooth number '${tooth}'. Must be 1-32 or A-T`);
            }
          });
        }
        
        // Validate surfaces if provided
        if (proc.surfaces) {
          proc.surfaces.forEach(surface => {
            if (!['M', 'O', 'D', 'B', 'L', 'I', 'F'].includes(surface)) {
              errors.push(`Procedure ${index + 1}: Invalid surface code '${surface}'`);
            }
          });
        }
      });
    }

    // Validate patient if provided
    if (data.patient) {
      if (!data.patient.firstName) errors.push('Patient first name is required');
      if (!data.patient.lastName) errors.push('Patient last name is required');
      if (!data.patient.dateOfBirth) errors.push('Patient date of birth is required');
      if (!data.patient.relationshipToSubscriber) errors.push('Patient relationship to subscriber is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate approximate segment count for SE segment
   */
  private static calculateSegmentCount(data: PA278Data): string {
    let count = 10;  // Base segments (ST, BHT, SE, etc.)
    count += 4;      // 2000A loop
    count += 6;      // 2000B loop
    count += 8;      // 2000C loop
    if (data.patient) count += 6;  // 2000D loop
    count += 8;      // 2000E loop
    count += data.procedures.length * 5;  // 2000F loops
    if (data.attachments) count += data.attachments.length * 2;
    return count.toString();
  }

  /**
   * Generate unique control number
   */
  private static generateControlNumber(): string {
    const timestamp = Date.now().toString().slice(-9);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return timestamp + random;
  }

  /**
   * Pad string to right with spaces
   */
  private static padRight(str: string, length: number): string {
    return str.padEnd(length, ' ');
  }

  /**
   * Format date according to EDI requirements
   */
  private static formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return format
      .replace('YYYY', year.toString())
      .replace('YY', year.toString().slice(-2))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes);
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private static isValidDate(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }

  /**
   * Validate tooth number (1-32 for permanent, A-T for primary)
   */
  private static isValidToothNumber(tooth: string): boolean {
    // Permanent teeth: 1-32
    const numericTooth = parseInt(tooth, 10);
    if (!isNaN(numericTooth) && numericTooth >= 1 && numericTooth <= 32) {
      return true;
    }
    // Primary teeth: A-T
    if (/^[A-T]$/i.test(tooth)) {
      return true;
    }
    return false;
  }
}

// ==========================================
// RESPONSE PARSER (for 278 Response)
// ==========================================
export interface PA278Response {
  transactionId?: string;
  actionCode: ActionCode;
  authorizationNumber?: string;
  certificationStartDate?: string;
  certificationEndDate?: string;
  certifiedQuantity?: number;
  rejectReasonCode?: string;
  additionalRejectReason?: string;
  messageText?: string;
  raw: unknown;
}

export class PA278ResponseParser {
  /**
   * Parse Stedi 278 response into CrownDesk format
   */
  static parse(response: any): PA278Response {
    // Extract HCR segment (Health Care Services Review decision)
    const hcr = response?.healthCareServicesReview || response?.HCR;
    const trn = response?.traceNumber || response?.TRN;
    const dtp = response?.dates || response?.DTP;
    const msg = response?.messageText || response?.MSG;

    return {
      transactionId: trn?.referenceIdentification || trn?.TRN02,
      actionCode: (hcr?.actionCode || hcr?.HCR01 || 'IP') as ActionCode,
      authorizationNumber: hcr?.authorizationNumber || hcr?.HCR02,
      certificationStartDate: this.extractDate(dtp, '607'),  // Certification Effective
      certificationEndDate: this.extractDate(dtp, '609'),    // Certification Expiration
      certifiedQuantity: hcr?.quantity,
      rejectReasonCode: hcr?.rejectReasonCode || hcr?.HCR03,
      additionalRejectReason: hcr?.additionalRejectReason || hcr?.HCR04,
      messageText: msg?.freeFormMessageText || msg?.MSG01,
      raw: response,
    };
  }

  /**
   * Map 278 action code to CrownDesk PA status
   */
  static mapActionToStatus(actionCode: ActionCode): string {
    const statusMap: Record<ActionCode, string> = {
      'A1': 'approved',           // Certified in total
      'A2': 'partially_approved', // Partial approval
      'A3': 'denied',             // Not certified
      'A4': 'pending_info',       // Pended - needs more info
      'A6': 'approved',           // Modified and approved
      'C': 'cancelled',           // Canceled
      'CT': 'pending',            // Contact payer
      'D': 'submitted',           // Deferred
      'IP': 'submitted',          // In Process
      'NA': 'not_required',       // No Action Required
    };
    return statusMap[actionCode] || 'pending';
  }

  /**
   * Extract date from DTP segments by qualifier
   */
  private static extractDate(dtp: any, qualifier: string): string | undefined {
    if (!dtp) return undefined;
    
    const dates = Array.isArray(dtp) ? dtp : [dtp];
    const found = dates.find((d: any) => 
      d?.dateTimeQualifier === qualifier || d?.DTP01 === qualifier
    );
    
    if (!found) return undefined;
    
    const dateValue = found.dateTimePeriod || found.DTP03;
    if (!dateValue) return undefined;
    
    // Convert CCYYMMDD to YYYY-MM-DD
    if (dateValue.length === 8) {
      return `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
    }
    return dateValue;
  }
}
