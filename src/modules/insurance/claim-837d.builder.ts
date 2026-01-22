/**
 * 837D EDI Claim Builder
 * Builds professional dental claims in 837D format for Stedi submission
 * 
 * Format: ANSI ASC X12 5010 - Version 837 (Dental)
 * Reference: https://www.stedi.com/edi/x12-005010/837
 */

export interface Claim837DData {
  // Submitter (Practice/Billing Entity)
  submitter: {
    organizationName: string;
    taxId: string;
    npi?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
  };

  // Billing Provider
  billingProvider: {
    organizationName: string;
    npi: string;
    taxId: string;
    taxonomyCode?: string;
    address: {
      street1: string;
      street2?: string;
      city: string;
      state: string;
      zip: string;
    };
    phone?: string;
  };

  // Rendering Provider (Dentist who performed service)
  renderingProvider: {
    firstName: string;
    lastName: string;
    npi: string;
    taxonomyCode?: string; // 1223D0001X = Dentist
  };

  // Payer (Insurance Company)
  payer: {
    name: string;
    payerId: string; // Stedi Payer ID
    address?: {
      street1: string;
      city: string;
      state: string;
      zip: string;
    };
  };

  // Subscriber (Insurance Policy Holder)
  subscriber: {
    memberId: string;
    groupNumber?: string;
    relationshipToPatient: '18' | '01' | '19' | '20' | '21' | '39' | '40' | '53'; // 18=self, 01=spouse, 19=child
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD
    gender: 'M' | 'F' | 'U';
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
  };

  // Claim Details
  claim: {
    controlNumber: string; // Unique claim identifier
    totalCharge: number;
    dateOfService: string; // YYYY-MM-DD
    placeOfService: '11' | '12' | '21' | '31' | '32'; // 11=Office, 12=Home, 21=Inpatient Hospital
    claimType: '1' | '2'; // 1=Professional, 2=Institutional
    
    // Diagnosis codes (optional for dental)
    diagnosisCodes?: {
      primary?: string; // ICD-10
      secondary?: string[];
    };

    // Accident details (if applicable)
    accidentDate?: string;
    accidentState?: string;
    
    // Additional information
    patientAccountNumber?: string;
    claimNote?: string;
  };

  // Service Lines (Procedures)
  procedures: Array<{
    lineNumber: number;
    cdtCode: string; // D0120, D1110, etc.
    description?: string;
    fee: number;
    quantity: number;
    dateOfService: string;
    toothNumber?: string; // 1-32 (Universal numbering)
    toothSurface?: string; // M, O, D, L, F, B (Mesial, Occlusal, Distal, Lingual, Facial, Buccal)
    diagnosisPointer?: string; // References diagnosis code
    placeOfService?: '11' | '12' | '21' | '31' | '32';
    emergencyIndicator?: boolean;
    noteRefCode?: string; // Links to additional notes
  }>;

  // Supporting documentation (optional)
  attachments?: Array<{
    type: 'xray' | 'narrative' | 'perio_chart' | 'image';
    transmissionCode: 'AB' | 'AD' | 'AF'; // AB=By mail, AD=Electronic, AF=By fax
    description?: string;
  }>;
}

export class Claim837DBuilder {
  /**
   * Build 837D EDI payload for Stedi
   */
  static build(data: Claim837DData): object {
    return {
      // Interchange Control Header (ISA)
      interchangeControlHeader: {
        authorizationInformationQualifier: '00',
        authorizationInformation: '          ',
        securityInformationQualifier: '00',
        securityInformation: '          ',
        senderIdQualifier: 'ZZ', // Mutually defined
        senderId: this.padRight(data.submitter.taxId.replace(/\D/g, ''), 15),
        receiverIdQualifier: 'ZZ',
        receiverId: this.padRight(data.payer.payerId, 15),
        interchangeDate: this.formatDate(new Date(), 'YYMMDD'),
        interchangeTime: this.formatDate(new Date(), 'HHmm'),
        interchangeControlStandardsIdentifier: '^',
        interchangeControlVersionNumber: '00501', // 5010 version
        interchangeControlNumber: this.generateControlNumber(),
        acknowledgmentRequested: '0',
        usageIndicator: 'T', // T=Test, P=Production
        componentElementSeparator: ':',
      },

      // Functional Group Header (GS)
      functionalGroupHeader: {
        functionalIdentifierCode: 'HC', // Health Care Claim
        applicationSendersCode: data.submitter.taxId.replace(/\D/g, ''),
        applicationReceiversCode: data.payer.payerId,
        date: this.formatDate(new Date(), 'YYYYMMDD'),
        time: this.formatDate(new Date(), 'HHmm'),
        groupControlNumber: this.generateControlNumber(),
        responsibleAgencyCode: 'X', // ANSI ASC X12
        versionReleaseIndustryIdentifierCode: '005010X222A1', // 837D version
      },

      // Transaction Set Header (ST)
      transactionSetHeader: {
        transactionSetIdentifierCode: '837', // Health Care Claim
        transactionSetControlNumber: data.claim.controlNumber,
        implementationConventionReference: '005010X222A1',
      },

      // Beginning of Hierarchical Transaction (BHT)
      beginningOfHierarchicalTransaction: {
        hierarchicalStructureCode: '0019', // Information source, subscriber, dependent
        transactionSetPurposeCode: '00', // Original
        referenceIdentification: data.claim.controlNumber,
        date: this.formatDate(new Date(), 'YYYYMMDD'),
        time: this.formatDate(new Date(), 'HHmmss'),
        claimOrEncounterIdentifier: '31', // Subrogation demand
      },

      // Submitter Name (1000A Loop)
      submitter: {
        name: data.submitter.organizationName,
        identificationCode: data.submitter.npi || data.submitter.taxId.replace(/\D/g, ''),
        identificationCodeQualifier: data.submitter.npi ? '46' : 'FI', // 46=EIN, FI=Federal Taxpayer ID
        contactInformation: data.submitter.contactName ? {
          name: data.submitter.contactName,
          communicationNumberQualifier1: 'TE',
          communicationNumber1: data.submitter.contactPhone,
          communicationNumberQualifier2: 'EM',
          communicationNumber2: data.submitter.contactEmail,
        } : undefined,
      },

      // Receiver Name (1000B Loop)
      receiver: {
        name: data.payer.name,
        identificationCode: data.payer.payerId,
        identificationCodeQualifier: 'PI', // Payor Identification
      },

      // Billing Provider Hierarchical Level (2000A Loop)
      billingProvider: {
        hierarchicalIdNumber: '1',
        hierarchicalParentIdNumber: '',
        hierarchicalLevelCode: '20', // Information Source
        hierarchicalChildCode: '1', // Has children
        
        providerInformation: {
          entityIdentifierCode: '85', // Billing Provider
          entityTypeQualifier: '2', // Non-person entity
          organizationName: data.billingProvider.organizationName,
          npi: data.billingProvider.npi,
          taxId: data.billingProvider.taxId.replace(/\D/g, ''),
          taxIdType: 'EI', // Employer Identification Number
          
          address: {
            addressLine1: data.billingProvider.address.street1,
            addressLine2: data.billingProvider.address.street2,
            city: data.billingProvider.address.city,
            state: data.billingProvider.address.state,
            zip: data.billingProvider.address.zip.replace(/\D/g, '').substring(0, 9),
          },
          
          phone: data.billingProvider.phone,
          taxonomyCode: data.billingProvider.taxonomyCode || '1223D0001X', // General Dentist
        },
      },

      // Subscriber Hierarchical Level (2000B Loop)
      subscriber: {
        hierarchicalIdNumber: '2',
        hierarchicalParentIdNumber: '1',
        hierarchicalLevelCode: '22', // Subscriber
        hierarchicalChildCode: data.patient ? '1' : '0', // Has patient if different from subscriber
        
        subscriberInformation: {
          payerResponsibilitySequence: '1', // Primary
          relationshipToSubscriber: data.subscriber.relationshipToPatient,
          
          individualOrOrganizationalName: {
            entityIdentifierCode: 'IL', // Insured or Subscriber
            entityTypeQualifier: '1', // Person
            lastName: data.subscriber.lastName,
            firstName: data.subscriber.firstName,
            identificationCode: data.subscriber.memberId,
            identificationCodeQualifier: 'MI', // Member Identification Number
          },
          
          address: data.subscriber.address ? {
            addressLine1: data.subscriber.address.street1,
            city: data.subscriber.address.city,
            state: data.subscriber.address.state,
            zip: data.subscriber.address.zip.replace(/\D/g, '').substring(0, 9),
          } : undefined,
          
          demographics: {
            dateTimePeriodFormatQualifier: 'D8',
            dateOfBirth: data.subscriber.dateOfBirth.replace(/-/g, ''),
            genderCode: data.subscriber.gender,
          },
          
          payerName: {
            entityIdentifierCode: 'PR', // Payer
            entityTypeQualifier: '2', // Non-person
            organizationName: data.payer.name,
            identificationCode: data.payer.payerId,
            identificationCodeQualifier: 'PI',
          },
        },
      },

      // Patient Hierarchical Level (2000C Loop) - Only if patient != subscriber
      patient: data.patient ? {
        hierarchicalIdNumber: '3',
        hierarchicalParentIdNumber: '2',
        hierarchicalLevelCode: '23', // Dependent
        hierarchicalChildCode: '0', // No children
        
        patientInformation: {
          individualOrOrganizationalName: {
            entityIdentifierCode: 'QC', // Patient
            entityTypeQualifier: '1',
            lastName: data.patient.lastName,
            firstName: data.patient.firstName,
          },
          
          demographics: {
            dateTimePeriodFormatQualifier: 'D8',
            dateOfBirth: data.patient.dateOfBirth.replace(/-/g, ''),
            genderCode: data.patient.gender,
          },
          
          relationshipToSubscriber: data.patient.relationshipToSubscriber,
        },
      } : undefined,

      // Claim Information (2300 Loop)
      claimInformation: {
        patientControlNumber: data.claim.patientAccountNumber || data.claim.controlNumber,
        totalClaimChargeAmount: data.claim.totalCharge.toFixed(2),
        placeOfServiceCode: data.claim.placeOfService,
        claimFrequencyTypeCode: '1', // Original claim
        signatureIndicator: 'Y', // Yes, signature on file
        planParticipationCode: 'A', // Assigned
        benefitsAssignmentCertificationIndicator: 'Y',
        releaseInformationCode: 'Y', // Yes, provider has release
        
        // Date of service
        dateTimeInformation: {
          dateTimeQualifier: '434', // Statement dates
          dateTimePeriodFormatQualifier: 'RD8',
          dateTimePeriod: data.claim.dateOfService.replace(/-/g, ''),
        },
        
        // Diagnosis codes (if provided)
        healthCareDiagnosisCodes: data.claim.diagnosisCodes ? {
          diagnosisTypeCode: 'ABK', // ICD-10
          principalDiagnosisCode: data.claim.diagnosisCodes.primary,
          diagnosis2: data.claim.diagnosisCodes.secondary?.[0],
          diagnosis3: data.claim.diagnosisCodes.secondary?.[1],
        } : undefined,
        
        // Rendering provider
        renderingProviderName: {
          entityIdentifierCode: '82', // Rendering Provider
          entityTypeQualifier: '1', // Person
          lastName: data.renderingProvider.lastName,
          firstName: data.renderingProvider.firstName,
          npi: data.renderingProvider.npi,
          taxonomyCode: data.renderingProvider.taxonomyCode || '1223D0001X',
        },
        
        // Service lines
        serviceLines: data.procedures.map((proc, index) => ({
          serviceLineNumber: (index + 1).toString(),
          professionalService: {
            productOrServiceIdQualifier: 'HC', // HCPCS
            procedureCode: proc.cdtCode,
            procedureModifier1: proc.toothSurface, // Surface modifier
            description: proc.description,
            lineItemChargeAmount: proc.fee.toFixed(2),
            unitBasisForMeasurementCode: 'UN', // Units
            serviceUnitCount: proc.quantity.toString(),
          },
          
          dateTimeInformation: {
            dateTimeQualifier: '472', // Service date
            dateTimePeriodFormatQualifier: 'D8',
            dateTimePeriod: proc.dateOfService.replace(/-/g, ''),
          },
          
          // Tooth information (dental-specific)
          oralCavityDesignation: proc.toothNumber ? {
            oralCavityDesignationCode: '01', // Universal numbering
            toothNumber: proc.toothNumber,
            toothSurface: proc.toothSurface,
          } : undefined,
          
          diagnosisCodePointer: proc.diagnosisPointer ? [proc.diagnosisPointer] : undefined,
        })),
      },

      // Transaction Set Trailer (SE)
      transactionSetTrailer: {
        numberOfIncludedSegments: '50', // Approximate, calculated by Stedi
        transactionSetControlNumber: data.claim.controlNumber,
      },

      // Functional Group Trailer (GE)
      functionalGroupTrailer: {
        numberOfTransactionSetsIncluded: '1',
        groupControlNumber: this.generateControlNumber(),
      },

      // Interchange Control Trailer (IEA)
      interchangeControlTrailer: {
        numberOfIncludedFunctionalGroups: '1',
        interchangeControlNumber: this.generateControlNumber(),
      },
    };
  }

  /**
   * Validate claim data before submission
   */
  static validate(data: Claim837DData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required submitter fields
    if (!data.submitter.organizationName) errors.push('Submitter organization name is required');
    if (!data.submitter.taxId) errors.push('Submitter tax ID is required');

    // Required billing provider fields
    if (!data.billingProvider.npi) errors.push('Billing provider NPI is required');
    if (!data.billingProvider.organizationName) errors.push('Billing provider name is required');
    if (!data.billingProvider.address) errors.push('Billing provider address is required');

    // Required rendering provider fields
    if (!data.renderingProvider.npi) errors.push('Rendering provider NPI is required');
    if (!data.renderingProvider.firstName || !data.renderingProvider.lastName) {
      errors.push('Rendering provider name is required');
    }

    // Required payer fields
    if (!data.payer.payerId) errors.push('Payer ID is required');
    if (!data.payer.name) errors.push('Payer name is required');

    // Required subscriber fields
    if (!data.subscriber.memberId) errors.push('Subscriber member ID is required');
    if (!data.subscriber.dateOfBirth) errors.push('Subscriber date of birth is required');

    // Required claim fields
    if (!data.claim.controlNumber) errors.push('Claim control number is required');
    if (!data.claim.dateOfService) errors.push('Date of service is required');
    if (data.claim.totalCharge <= 0) errors.push('Total charge must be greater than zero');

    // Validate procedures
    if (!data.procedures || data.procedures.length === 0) {
      errors.push('At least one procedure is required');
    } else {
      data.procedures.forEach((proc, index) => {
        if (!proc.cdtCode) errors.push(`Procedure ${index + 1}: CDT code is required`);
        if (!proc.cdtCode.match(/^D\d{4}$/)) errors.push(`Procedure ${index + 1}: Invalid CDT code format (must be D####)`);
        if (proc.fee <= 0) errors.push(`Procedure ${index + 1}: Fee must be greater than zero`);
        if (proc.quantity <= 0) errors.push(`Procedure ${index + 1}: Quantity must be greater than zero`);
        if (!proc.dateOfService) errors.push(`Procedure ${index + 1}: Date of service is required`);
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
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
   * Pad string to right
   */
  private static padRight(str: string, length: number): string {
    return str.padEnd(length, ' ');
  }

  /**
   * Format date
   */
  private static formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return format
      .replace('YYYY', year.toString())
      .replace('YY', year.toString().slice(-2))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }
}
