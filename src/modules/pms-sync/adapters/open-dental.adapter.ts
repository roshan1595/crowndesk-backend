/**
 * CrownDesk V2 - Open Dental PMS Adapter
 * Per plan.txt Section 10: PMS Integration
 * Implements adapter pattern for Open Dental API
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type FetchResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<any>;
};

export interface PmsPatient {
  pmsId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: Date;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  workPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  ssn?: string;
  gender?: string;
}

export interface PmsAppointment {
  pmsId: string;
  patientPmsId: string;
  provider?: string;
  operatory?: string;
  startTime: Date;
  endTime: Date;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  procedures?: string[];
  notes?: string;
  dateTimeStamp?: Date;
}

export interface PmsInsurancePlan {
  pmsId: string;
  carrierName: string;
  payerId?: string;
  groupName?: string;
  groupNumber?: string;
  planType?: string;
}

export interface PmsInsuranceSubscription {
  pmsId: string;
  patientPmsId: string;
  subscriberPmsId: string;
  planPmsId: string;
  subscriberId: string;
  dateEffective?: Date;
  dateTerminated?: Date;
  relationship?: string;
}

export interface PmsBenefit {
  planPmsId: string;
  coverageLevel: string;  // 'individual' | 'family'
  benefitType: string;    // 'deductible', 'annual_max', 'preventive', etc.
  percent?: number;
  monetaryAmount?: number;
  quantity?: number;
  timePeriod?: string;
}

/**
 * Completed procedure from Open Dental (procedurelog table)
 * This is what doctors fill in after treatment - critical for billing!
 */
export interface PmsProcedure {
  pmsId: string;           // ProcNum
  patientPmsId: string;    // PatNum
  appointmentPmsId?: string; // AptNum (if linked to appointment)
  cdtCode: string;         // CodeNum -> ProcedureCode
  description: string;     // ProcCode.Descript
  procDate: Date;          // ProcDate
  procStatus: 'treatment_planned' | 'completed' | 'existing_current' | 'existing_other' | 'referred_out' | 'deleted' | 'condition' | 'estimate';
  toothNum?: string;       // ToothNum
  surface?: string;        // Surf
  procFee: number;         // ProcFee
  priority?: number;       // Priority
  providerId?: string;     // ProvNum
  diagCode?: string;       // DiagnosticCode
  note?: string;           // Note (treatment notes by doctor)
  dateComplete?: Date;     // DateComplete
  dateTimeStamp?: Date;    // DateTStamp
}

/**
 * Treatment Plan from Open Dental
 */
export interface PmsTreatmentPlan {
  pmsId: string;           // TreatPlanNum
  patientPmsId: string;    // PatNum
  dateCreated: Date;       // DateTP
  heading?: string;        // Heading (plan name)
  note?: string;           // Note
  status: 'active' | 'inactive' | 'saved';
  procedures: PmsProcedure[];  // Linked from proctp table
}

/**
 * Procedure codes (CDT codes) from Open Dental
 */
export interface PmsProcedureCode {
  codeNum: string;         // CodeNum (internal ID)
  code: string;            // ProcCode (actual CDT code like D0120)
  description: string;     // Descript
  abbreviation?: string;   // AbbrDesc
  procTime?: string;       // ProcTime (duration)
  defaultFee?: number;     // From fee table
  category?: string;       // ProcCat
  isHygiene?: boolean;     // IsHygiene
  paintType?: string;      // PaintType (for charting)
}

/**
 * Provider from Open Dental
 */
export interface PmsProvider {
  provNum: number;         // ProvNum
  firstName: string;       // FName
  lastName: string;        // LName
  abbr?: string;          // Abbr
  suffix?: string;         // Suffix
  npi?: string;           // NationalProvID
  stateLicense?: string;   // StateLicense
  specialty?: string;      // Specialty
  isHidden?: boolean;      // IsHidden (inactive)
}

/**
 * Operatory (dental chair/room) from Open Dental
 */
export interface PmsOperatory {
  operatoryNum: number;    // OperatoryNum
  opName: string;          // OpName
  abbrev?: string;         // Abbrev
  isHidden?: boolean;      // IsHidden (inactive)
  itemOrder?: number;      // ItemOrder (display order)
}

export interface PmsAdapter {
  isConfigured(): boolean;
  fetchPatients(since?: Date): Promise<PmsPatient[]>;
  fetchAppointments(since?: Date): Promise<PmsAppointment[]>;
  fetchInsurancePlans(since?: Date): Promise<PmsInsurancePlan[]>;
  fetchInsuranceSubscriptions(patientPmsId?: string): Promise<PmsInsuranceSubscription[]>;
  fetchBenefits(planPmsId: string): Promise<PmsBenefit[]>;
  fetchProcedures(since?: Date, patientPmsId?: string): Promise<PmsProcedure[]>;
  fetchProcedureCodes(): Promise<PmsProcedureCode[]>;
  fetchTreatmentPlans(patientPmsId?: string): Promise<PmsTreatmentPlan[]>;
  fetchProviders(): Promise<PmsProvider[]>;
  fetchOperatories(): Promise<PmsOperatory[]>;
  pushPatient(patient: any): Promise<string>;
  pushAppointment(appointment: any): Promise<string>;
}

@Injectable()
export class OpenDentalAdapter implements PmsAdapter {
  private readonly logger = new Logger(OpenDentalAdapter.name);
  private readonly baseUrl: string;
  private readonly authScheme: string;
  private readonly devKey: string;
  private readonly customerKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get('OPENDENTAL_BASE_URL') || 'https://api.opendental.com/api/v1';
    this.authScheme = this.config.get('OPENDENTAL_AUTH_SCHEME') || 'ODFHIR';
    this.devKey = this.config.get('OPENDENTAL_DEV_KEY') || '';
    this.customerKey = this.config.get('OPENDENTAL_CUSTOMER_KEY') || '';
  }

  /**
   * Check if Open Dental API is configured
   */
  isConfigured(): boolean {
    return !!(this.devKey && this.customerKey);
  }

  private getAuthHeader(): string {
    return `${this.authScheme} ${this.devKey}/${this.customerKey}`;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.isConfigured()) {
      this.logger.warn('Open Dental API not configured, returning mock data');
      return this.getMockResponse(endpoint);
    }

    const url = `${this.baseUrl}${endpoint}`;
    this.logger.debug(`[Open Dental API] Request: ${url}`);
    
    try {
      const response = (await fetch(url, {
        ...options,
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })) as FetchResponse;

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        this.logger.error(`Open Dental API error: ${response.status} ${response.statusText}`, {
          url,
          status: response.status,
          error: errorBody,
        });
        
        // Fallback to mock data on API error
        this.logger.warn(`Falling back to mock data for ${endpoint}`);
        return this.getMockResponse(endpoint);
      }

      return response.json();
    } catch (error: any) {
      this.logger.error(`Open Dental API request failed: ${error.message}`, error.stack);
      // Fallback to mock data on network error
      this.logger.warn(`Falling back to mock data for ${endpoint}`);
      return this.getMockResponse(endpoint);
    }
  }

  private getMockResponse(endpoint: string): any {
    // Return mock data when API not configured (for development)
    if (endpoint.includes('/patients')) {
      return [
        {
          PatNum: 1,
          LName: 'Smith',
          FName: 'John',
          MiddleI: 'A',
          Birthdate: '1980-05-15',
          Gender: 0,
          Email: 'john.smith@example.com',
          HmPhone: '555-0101',
          WirelessPhone: '555-0102',
          Address: '123 Main St',
          City: 'Springfield',
          State: 'IL',
          Zip: '62701',
        },
        {
          PatNum: 2,
          LName: 'Johnson',
          FName: 'Sarah',
          MiddleI: 'B',
          Birthdate: '1992-08-22',
          Gender: 1,
          Email: 'sarah.j@example.com',
          HmPhone: '555-0201',
          WirelessPhone: '555-0202',
          Address: '456 Oak Ave',
          City: 'Springfield',
          State: 'IL',
          Zip: '62702',
        },
      ];
    }
    if (endpoint.includes('/procedurelogs')) {
      return [
        {
          ProcNum: 1,
          PatNum: 1,
          CodeNum: 120, // D0120
          ProcDate: new Date().toISOString().split('T')[0],
          ProcStatus: 2, // Completed
          ProcFee: 75.00,
          ToothNum: '8',
          Surf: '',
          Descript: 'Periodic oral evaluation',
          Note: 'Patient presents with good oral hygiene',
          DiagnosticCode: '',
          DateComplete: new Date().toISOString().split('T')[0],
          ProvNum: 1,
        },
        {
          ProcNum: 2,
          PatNum: 1,
          CodeNum: 1110, // D1110
          ProcDate: new Date().toISOString().split('T')[0],
          ProcStatus: 2, // Completed
          ProcFee: 125.00,
          ToothNum: '',
          Surf: '',
          Descript: 'Prophylaxis - adult',
          Note: 'Routine cleaning performed',
          DiagnosticCode: '',
          DateComplete: new Date().toISOString().split('T')[0],
          ProvNum: 1,
        },
        {
          ProcNum: 3,
          PatNum: 2,
          CodeNum: 274, // D0274
          ProcDate: new Date().toISOString().split('T')[0],
          ProcStatus: 2, // Completed
          ProcFee: 85.00,
          ToothNum: '',
          Surf: '',
          Descript: 'Bitewings - four radiographic images',
          Note: 'X-rays completed',
          DiagnosticCode: '',
          DateComplete: new Date().toISOString().split('T')[0],
          ProvNum: 1,
        },
      ];
    }
    if (endpoint.includes('/procedurecodes')) {
      return [
        { ProcCode: 'D0120', Descript: 'Periodic oral evaluation', ProcFee: 75.00, ProcCat: 1 },
        { ProcCode: 'D1110', Descript: 'Prophylaxis - adult', ProcFee: 125.00, ProcCat: 2 },
        { ProcCode: 'D0274', Descript: 'Bitewings - four radiographic images', ProcFee: 85.00, ProcCat: 1 },
      ];
    }
    if (endpoint.includes('/providers')) {
      return [
        { ProvNum: 1, LName: 'Williams', FName: 'Dr. Robert', Abbr: 'RW', Specialty: 'General Dentistry' },
        { ProvNum: 2, LName: 'Davis', FName: 'Dr. Emily', Abbr: 'ED', Specialty: 'Orthodontics' },
      ];
    }
    if (endpoint.includes('/operatories')) {
      return [
        { OperatoryNum: 1, OpName: 'Op 1', Abbrev: 'OP1', IsHidden: false },
        { OperatoryNum: 2, OpName: 'Op 2', Abbrev: 'OP2', IsHidden: false },
        { OperatoryNum: 3, OpName: 'Op 3', Abbrev: 'OP3', IsHidden: false },
      ];
    }
    if (endpoint.includes('/appointments')) {
      return [];
    }
    if (endpoint.includes('/insplans')) {
      return [];
    }
    if (endpoint.includes('/inssubs')) {
      return [];
    }
    if (endpoint.includes('/benefits')) {
      return [];
    }
    if (endpoint.includes('/treatplans')) {
      return [];
    }
    if (endpoint.includes('/proctps')) {
      return [];
    }
    return [];
  }

  async fetchPatients(since?: Date): Promise<PmsPatient[]> {
    this.logger.log(`Fetching patients from Open Dental${since ? ` since ${since.toISOString()}` : ''}`);

    // Note: Open Dental /patients endpoint does not support DateTStamp parameter
    // The API returns all patients and we filter client-side
    // For production, consider using a different endpoint or pagination
    const endpoint = `/patients`;
    const data = await this.makeRequest(endpoint);
    
    // Filter by date client-side if needed
    let patients = (data || []).map((p: any) => this.mapPatient(p));
    
    if (since) {
      patients = patients.filter((p: PmsPatient) => {
        // Assuming Open Dental returns DateTStamp field in patient data
        const patientDate = (data.find((d: any) => d.PatNum === p.pmsId) as any)?.DateTStamp;
        if (patientDate) {
          return new Date(patientDate) >= since;
        }
        return true; // Include if no timestamp
      });
      this.logger.debug(`[Open Dental] Filtered to ${patients.length} patients modified since ${since.toISOString()}`);
    }
    
    return patients;
  }

  async fetchAppointments(since?: Date): Promise<PmsAppointment[]> {
    this.logger.log(`Fetching appointments from Open Dental${since ? ` since ${since.toISOString()}` : ''}`);

    const params = new URLSearchParams();
    if (since) {
      // Open Dental requires DateTStamp in format: yyyy-MM-dd HH:mm:ss
      const datetime = since.toISOString()
        .replace('T', ' ')
        .split('.')[0]; // Remove milliseconds
      params.append('DateTStamp', datetime);
      this.logger.debug(`[Open Dental] Using DateTStamp: ${datetime}`);
    }

    const endpoint = `/appointments${params.toString() ? '?' + params.toString() : ''}`;
    const data = await this.makeRequest(endpoint);
    
    return (data || []).map((a: any) => this.mapAppointment(a));
  }

  async fetchInsurancePlans(since?: Date): Promise<PmsInsurancePlan[]> {
    this.logger.log(`Fetching insurance plans from Open Dental${since ? ` since ${since.toISOString()}` : ''}`);

    // First fetch carriers to get carrier names
    const carriers = await this.fetchCarriers();
    const carrierMap = new Map(carriers.map(c => [c.carrierNum, c.carrierName]));
    this.logger.debug(`[Open Dental] Loaded ${carrierMap.size} carriers for lookup`);

    const params = new URLSearchParams();
    if (since) {
      params.append('DateTStamp', since.toISOString().split('T')[0]);
    }

    const endpoint = `/insplans${params.toString() ? '?' + params.toString() : ''}`;
    const data = await this.makeRequest(endpoint);
    
    return (data || []).map((plan: any) => this.mapInsurancePlan(plan, carrierMap));
  }

  /**
   * Fetch insurance carriers from Open Dental
   * Carriers contain the actual carrier names (e.g., "Cigna", "Delta Dental")
   */
  async fetchCarriers(): Promise<{ carrierNum: string; carrierName: string }[]> {
    this.logger.log('Fetching insurance carriers from Open Dental');
    
    try {
      const data = await this.makeRequest('/carriers');
      return (data || []).map((carrier: any) => ({
        carrierNum: carrier.CarrierNum?.toString() || '',
        carrierName: carrier.CarrierName || '',
      }));
    } catch (error: any) {
      this.logger.warn(`Failed to fetch carriers: ${error.message}. CarrierName will be empty.`);
      return [];
    }
  }

  async fetchInsuranceSubscriptions(patientPmsId?: string): Promise<PmsInsuranceSubscription[]> {
    this.logger.log(`Fetching insurance subscriptions from Open Dental`);

    const params = new URLSearchParams();
    if (patientPmsId) {
      params.append('PatNum', patientPmsId);
    }

    const endpoint = `/inssubs${params.toString() ? '?' + params.toString() : ''}`;
    const data = await this.makeRequest(endpoint);
    
    // Debug: Log first subscription to see structure
    if (data && data.length > 0) {
      this.logger.debug(`[Open Dental] Sample insurance subscription fields:`, Object.keys(data[0]).join(', '));
      this.logger.debug(`[Open Dental] First subscription data:`, JSON.stringify(data[0], null, 2));
    }
    
    return (data || []).map((sub: any) => this.mapInsuranceSubscription(sub));
  }

  async fetchBenefits(planPmsId: string): Promise<PmsBenefit[]> {
    this.logger.log(`Fetching benefits for plan ${planPmsId} from Open Dental`);

    const params = new URLSearchParams();
    params.append('PlanNum', planPmsId);

    const endpoint = `/benefits?${params.toString()}`;
    const data = await this.makeRequest(endpoint);
    
    return (data || []).map((benefit: any) => this.mapBenefit(benefit));
  }

  /**
   * Fetch completed procedures (procedurelog) from Open Dental
   * This is the critical data for billing - treatments done by doctors
   */
  async fetchProcedures(since?: Date, patientPmsId?: string): Promise<PmsProcedure[]> {
    this.logger.log(`Fetching procedures from Open Dental${since ? ` since ${since.toISOString()}` : ''}`);

    const params = new URLSearchParams();
    if (since) {
      params.append('DateTStamp', since.toISOString().split('T')[0]);
    }
    if (patientPmsId) {
      params.append('PatNum', patientPmsId);
    }

    // Open Dental API endpoint for procedures (procedurelog)
    const endpoint = `/procedurelogs${params.toString() ? '?' + params.toString() : ''}`;
    const data = await this.makeRequest(endpoint);
    
    return (data || []).map((proc: any) => this.mapProcedure(proc));
  }

  /**
   * Fetch procedure codes (CDT codes) from Open Dental
   */
  async fetchProcedureCodes(): Promise<PmsProcedureCode[]> {
    this.logger.log('Fetching procedure codes from Open Dental');

    const endpoint = '/procedurecodes';
    const data = await this.makeRequest(endpoint);
    
    return (data || []).map((code: any) => this.mapProcedureCode(code));
  }

  /**
   * Fetch treatment plans from Open Dental
   */
  async fetchTreatmentPlans(patientPmsId?: string): Promise<PmsTreatmentPlan[]> {
    this.logger.log(`Fetching treatment plans from Open Dental${patientPmsId ? ` for patient ${patientPmsId}` : ''}`);

    const params = new URLSearchParams();
    if (patientPmsId) {
      params.append('PatNum', patientPmsId);
    }

    // Fetch treatment plans
    const endpoint = `/treatplans${params.toString() ? '?' + params.toString() : ''}`;
    const plansData = await this.makeRequest(endpoint);
    
    const plans: PmsTreatmentPlan[] = [];
    
    for (const plan of (plansData || [])) {
      // Fetch procedures linked to this treatment plan
      const procTpParams = new URLSearchParams();
      procTpParams.append('TreatPlanNum', plan.TreatPlanNum.toString());
      
      const procTpData = await this.makeRequest(`/proctps?${procTpParams.toString()}`);
      
      plans.push(this.mapTreatmentPlan(plan, procTpData || []));
    }
    
    return plans;
  }

  async fetchProviders(): Promise<PmsProvider[]> {
    this.logger.log('Fetching providers from Open Dental');
    
    if (!this.isConfigured()) {
      this.logger.warn('Open Dental API not configured, returning mock data');
      return this.getMockResponse('providers') as PmsProvider[];
    }

    const endpoint = '/providers';
    const data = await this.makeRequest(endpoint);
    
    // Map Open Dental field names to our interface
    // Open Dental uses: ProvNum, FName, LName, Abbr, Suffix, NationalProvID, StateLicense, Specialty, IsHidden
    return (data || []).map((p: any) => ({
      provNum: p.ProvNum || p.provNum,
      firstName: p.FName || p.firstName || '',
      lastName: p.LName || p.lastName || '',
      abbr: p.Abbr || p.abbr,
      suffix: p.Suffix || p.suffix,
      npi: p.NationalProvID || p.npi,
      stateLicense: p.StateLicense || p.stateLicense,
      specialty: p.Specialty || p.specialty,
      isHidden: p.IsHidden ?? p.isHidden,
    }));
  }

  async fetchOperatories(): Promise<PmsOperatory[]> {
    this.logger.log('Fetching operatories from Open Dental');
    
    if (!this.isConfigured()) {
      this.logger.warn('Open Dental API not configured, returning mock data');
      return this.getMockResponse('operatories') as PmsOperatory[];
    }

    const endpoint = '/operatories';
    const data = await this.makeRequest(endpoint);
    
    // Map Open Dental field names to our interface
    // Open Dental uses: OperatoryNum, OpName, Abbrev, IsHidden, ItemOrder, IsHygiene
    return (data || []).map((o: any) => ({
      operatoryNum: o.OperatoryNum || o.operatoryNum,
      opName: o.OpName || o.opName || '',
      abbrev: o.Abbrev || o.abbrev,
      isHidden: o.IsHidden ?? o.isHidden,
      itemOrder: o.ItemOrder || o.itemOrder,
      isHygiene: o.IsHygiene ?? o.isHygiene,
    }));
  }

  /**
   * Fetch family members for a patient using accountmodules endpoint
   * Returns all family members including the guarantor
   * @param patientPmsId - PatNum of any family member
   */
  async fetchFamilyMembers(patientPmsId: string): Promise<{
    guarantorPmsId: string;
    memberPmsIds: string[];
    totalBalance: number;
  }> {
    this.logger.log(`Fetching family members for patient ${patientPmsId}`);

    if (!this.isConfigured()) {
      this.logger.warn('Open Dental API not configured, returning empty family');
      return {
        guarantorPmsId: patientPmsId,
        memberPmsIds: [patientPmsId],
        totalBalance: 0,
      };
    }

    const endpoint = `/accountmodules/${patientPmsId}/PatientBalances`;
    const data = await this.makeRequest(endpoint);

    if (!data || data.length === 0) {
      this.logger.debug(`No family data found for patient ${patientPmsId}`);
      return {
        guarantorPmsId: patientPmsId,
        memberPmsIds: [patientPmsId],
        totalBalance: 0,
      };
    }

    // First PatNum in response is the guarantor
    const guarantorPmsId = data[0]?.PatNum?.toString() || patientPmsId;
    
    // Filter out "Entire Family" special row and extract PatNums
    const memberPmsIds = data
      .filter((member: any) => member.Name !== 'Entire Family')
      .map((member: any) => member.PatNum.toString());

    // Find "Entire Family" row for total balance
    const familyRow = data.find((member: any) => member.Name === 'Entire Family');
    const totalBalance = familyRow?.Balance || 0;

    this.logger.debug(
      `Family for patient ${patientPmsId}: Guarantor=${guarantorPmsId}, Members=${memberPmsIds.length}, Balance=$${totalBalance}`
    );

    return {
      guarantorPmsId,
      memberPmsIds,
      totalBalance,
    };
  }

  async pushPatient(patient: any): Promise<string> {
    this.logger.log(`Pushing patient to Open Dental`);

    if (!this.isConfigured()) {
      throw new Error('Open Dental API not configured');
    }

    const data = await this.makeRequest('/patients', {
      method: 'POST',
      body: JSON.stringify({
        FName: patient.firstName,
        LName: patient.lastName,
        MiddleI: patient.middleName || '',
        Birthdate: patient.dob instanceof Date ? patient.dob.toISOString().split('T')[0] : patient.dob,
        Email: patient.email || '',
        WirelessPhone: patient.mobilePhone || patient.phone || '',
        HmPhone: patient.phone || '',
        WkPhone: patient.workPhone || '',
        Address: patient.address?.street || '',
        City: patient.address?.city || '',
        State: patient.address?.state || '',
        Zip: patient.address?.zip || '',
        Gender: this.mapGenderToOpenDental(patient.gender),
      }),
    });

    return data.PatNum.toString();
  }

  async pushAppointment(appointment: any): Promise<string> {
    this.logger.log(`Pushing appointment to Open Dental`);

    if (!this.isConfigured()) {
      throw new Error('Open Dental API not configured');
    }

    const data = await this.makeRequest('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        PatNum: appointment.patientPmsId,
        AptDateTime: appointment.startTime instanceof Date 
          ? appointment.startTime.toISOString() 
          : appointment.startTime,
        AptStatus: this.mapStatusToOpenDental(appointment.status),
        Note: appointment.notes || '',
        Op: appointment.operatory || '',
        ProvNum: appointment.providerId || '',
      }),
    });

    return data.AptNum.toString();
  }

  // === Mapping Functions ===

  private mapPatient(odPatient: any): PmsPatient {
    // IMPORTANT: Open Dental Family Mapping Strategy
    // The /patients endpoint does NOT expose Guarantor or FamNum fields
    // CORRECT APPROACH: Use /accountmodules/{PatNum}/PatientBalances endpoint
    // - Returns ALL family members for any patient
    // - First PatNum in response = Guarantor
    // - Official API endpoint (Version 22.1+) designed for family relationships
    // See: OPEN_DENTAL_FAMILY_MAPPING.md for complete implementation details
    return {
      pmsId: odPatient.PatNum?.toString() || '',
      firstName: odPatient.FName || '',
      lastName: odPatient.LName || '',
      middleName: odPatient.MiddleI || undefined,
      dateOfBirth: new Date(odPatient.Birthdate),
      email: odPatient.Email || undefined,
      phone: odPatient.HmPhone || undefined,
      mobilePhone: odPatient.WirelessPhone || undefined,
      workPhone: odPatient.WkPhone || undefined,
      address: odPatient.Address || undefined,
      city: odPatient.City || undefined,
      state: odPatient.State || undefined,
      zip: odPatient.Zip || undefined,
      ssn: odPatient.SSN || undefined,
      gender: this.mapGenderFromOpenDental(odPatient.Gender),
    };
  }

  private mapAppointment(odAppt: any): PmsAppointment {
    const startTime = new Date(odAppt.AptDateTime);
    // Pattern length * 5 minutes per slot
    const durationMinutes = (odAppt.Pattern?.length || 1) * 5;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    return {
      pmsId: odAppt.AptNum?.toString() || '',
      patientPmsId: odAppt.PatNum?.toString() || '',
      provider: odAppt.provAbbr || odAppt.ProvNum?.toString(),
      operatory: odAppt.Op?.toString(),
      startTime,
      endTime,
      status: this.mapStatusFromOpenDental(odAppt.AptStatus),
      notes: odAppt.Note || undefined,
      procedures: odAppt.ProcDescript ? [odAppt.ProcDescript] : undefined,
      dateTimeStamp: odAppt.DateTStamp ? new Date(odAppt.DateTStamp) : undefined,
    };
  }

  private mapInsurancePlan(odPlan: any, carrierMap?: Map<string, string>): PmsInsurancePlan {
    // Open Dental /insplans returns CarrierNum (FK to carrier table)
    // We need to lookup the actual CarrierName from the carrier map
    const carrierNum = odPlan.CarrierNum?.toString() || '';
    const carrierName = carrierMap?.get(carrierNum) || odPlan.CarrierName || '';
    
    if (!carrierName && carrierNum) {
      this.logger.debug(`[Open Dental] No carrier name found for CarrierNum: ${carrierNum}`);
    }
    
    return {
      pmsId: odPlan.PlanNum?.toString() || '',
      carrierName: carrierName,
      payerId: odPlan.ElectID || undefined,
      groupName: odPlan.GroupName || undefined,
      groupNumber: odPlan.GroupNum || undefined,
      planType: odPlan.PlanType || undefined,
    };
  }

  private mapInsuranceSubscription(odSub: any): PmsInsuranceSubscription {
    // Open Dental insurance subscriptions use the "Subscriber" field to identify the account holder
    // The Subscriber field contains the PatNum of the insurance policy holder (guarantor)
    // Note: Open Dental API does NOT return a "PatNum" field in insurance subscriptions
    const patientId = odSub.Subscriber?.toString() || '';
    
    if (!patientId) {
      this.logger.warn(`[Open Dental] Insurance subscription ${odSub.InsSubNum} has no Subscriber field`);
    }
    
    return {
      pmsId: odSub.InsSubNum?.toString() || '',
      patientPmsId: patientId,
      subscriberPmsId: odSub.Subscriber?.toString() || '',
      planPmsId: odSub.PlanNum?.toString() || '',
      subscriberId: odSub.SubscriberID || '',
      dateEffective: odSub.DateEffective ? new Date(odSub.DateEffective) : undefined,
      dateTerminated: odSub.DateTerm ? new Date(odSub.DateTerm) : undefined,
      relationship: this.mapRelationshipFromOpenDental(odSub.Relationship),
    };
  }

  private mapBenefit(odBenefit: any): PmsBenefit {
    return {
      planPmsId: odBenefit.PlanNum?.toString() || '',
      coverageLevel: odBenefit.CoverageLevel === 1 ? 'individual' : 'family',
      benefitType: this.mapBenefitType(odBenefit.BenefitType),
      percent: odBenefit.Percent !== -1 ? odBenefit.Percent : undefined,
      monetaryAmount: odBenefit.MonetaryAmt !== -1 ? odBenefit.MonetaryAmt : undefined,
      quantity: odBenefit.Quantity !== -1 ? odBenefit.Quantity : undefined,
      timePeriod: this.mapTimePeriod(odBenefit.TimePeriod),
    };
  }

  private mapStatusFromOpenDental(odStatus: number): PmsAppointment['status'] {
    const statusMap: Record<number, PmsAppointment['status']> = {
      1: 'scheduled',
      2: 'completed',
      3: 'scheduled', // unscheduled maps to scheduled
      5: 'cancelled',
      6: 'no_show',   // broken maps to no_show
    };
    return statusMap[odStatus] || 'scheduled';
  }

  private mapStatusToOpenDental(status: string): number {
    const statusMap: Record<string, number> = {
      scheduled: 1,
      confirmed: 1,
      checked_in: 1,
      in_progress: 1,
      completed: 2,
      unscheduled: 3,
      cancelled: 5,
      no_show: 6,
    };
    return statusMap[status] || 1;
  }

  private mapGenderFromOpenDental(odGender: number): string | undefined {
    const genderMap: Record<number, string> = {
      0: 'male',
      1: 'female',
      2: 'unknown',
    };
    return genderMap[odGender];
  }

  private mapGenderToOpenDental(gender?: string): number {
    const genderMap: Record<string, number> = {
      male: 0,
      female: 1,
      unknown: 2,
      other: 2,
    };
    return gender ? (genderMap[gender.toLowerCase()] ?? 2) : 2;
  }

  private mapRelationshipFromOpenDental(odRelation: number): string {
    const relationMap: Record<number, string> = {
      0: 'self',
      1: 'spouse',
      2: 'child',
      3: 'employee',
      4: 'handicapped_dependent',
      5: 'significant_other',
      6: 'injured_plaintiff',
      7: 'life_partner',
      8: 'dependent',
    };
    return relationMap[odRelation] || 'other';
  }

  private mapBenefitType(odBenefitType: number): string {
    const benefitTypeMap: Record<number, string> = {
      0: 'active_coverage',
      1: 'deductible',
      2: 'percentage',
      3: 'co_payment',
      4: 'exclusions',
      5: 'limitations',
      6: 'age_limit',
      7: 'waiting_period',
      8: 'annual_max',
      9: 'lifetime_max',
    };
    return benefitTypeMap[odBenefitType] || 'other';
  }

  private mapTimePeriod(odTimePeriod: number): string {
    const timePeriodMap: Record<number, string> = {
      0: 'none',
      1: 'service_year',
      2: 'calendar_year',
      3: 'lifetime',
      4: 'years',
      5: 'months',
    };
    return timePeriodMap[odTimePeriod] || 'none';
  }

  /**
   * Map Open Dental procedurelog to our PmsProcedure interface
   * ProcStatus values in Open Dental:
   * 1 = Treatment Planned, 2 = Complete, 3 = Existing Current, 4 = Existing Other,
   * 5 = Referred Out, 6 = Deleted, 7 = Condition, 8 = Estimate
   */
  private mapProcedure(odProc: any): PmsProcedure {
    const statusMap: Record<number, PmsProcedure['procStatus']> = {
      1: 'treatment_planned',
      2: 'completed',
      3: 'existing_current',
      4: 'existing_other',
      5: 'referred_out',
      6: 'deleted',
      7: 'condition',
      8: 'estimate',
    };

    return {
      pmsId: odProc.ProcNum?.toString() || '',
      patientPmsId: odProc.PatNum?.toString() || '',
      appointmentPmsId: odProc.AptNum ? odProc.AptNum.toString() : undefined,
      cdtCode: odProc.CodeNum?.toString() || '', // Will need to lookup actual code
      description: odProc.ProcDescript || odProc.ToothRange || '',
      procDate: new Date(odProc.ProcDate),
      procStatus: statusMap[odProc.ProcStatus] || 'treatment_planned',
      toothNum: odProc.ToothNum ? odProc.ToothNum.toString() : undefined,
      surface: odProc.Surf || undefined,
      procFee: odProc.ProcFee || 0,
      priority: odProc.Priority,
      providerId: odProc.ProvNum ? odProc.ProvNum.toString() : undefined,
      diagCode: odProc.DiagnosticCode || undefined,
      note: odProc.Note || undefined,
      dateComplete: odProc.DateComplete ? new Date(odProc.DateComplete) : undefined,
      dateTimeStamp: odProc.DateTStamp ? new Date(odProc.DateTStamp) : undefined,
    };
  }

  /**
   * Map Open Dental procedurecode to our PmsProcedureCode interface
   */
  private mapProcedureCode(odCode: any): PmsProcedureCode {
    return {
      codeNum: odCode.CodeNum?.toString() || '',
      code: odCode.ProcCode || '',
      description: odCode.Descript || '',
      abbreviation: odCode.AbbrDesc || undefined,
      procTime: odCode.ProcTime || undefined,
      category: odCode.ProcCat?.toString() || undefined,
      isHygiene: odCode.IsHygiene === true,
      paintType: odCode.PaintType?.toString() || undefined,
    };
  }

  /**
   * Map Open Dental treatplan to our PmsTreatmentPlan interface
   * TPStatus values: 0 = Active, 1 = Inactive, 2 = Saved
   */
  private mapTreatmentPlan(odPlan: any, odProcTps: any[]): PmsTreatmentPlan {
    const statusMap: Record<number, PmsTreatmentPlan['status']> = {
      0: 'active',
      1: 'inactive',
      2: 'saved',
    };

    const procedures: PmsProcedure[] = (odProcTps || []).map((procTp: any) => ({
      pmsId: procTp.ProcTPNum?.toString() || '',
      patientPmsId: procTp.PatNum?.toString() || '',
      cdtCode: procTp.CodeNum?.toString() || '',
      description: procTp.Descript || '',
      procDate: procTp.DateTP ? new Date(procTp.DateTP) : new Date(),
      procStatus: 'treatment_planned' as const,
      toothNum: procTp.ToothNumTP || undefined,
      surface: procTp.Surf || undefined,
      procFee: procTp.FeeAmt || 0,
      priority: procTp.Priority,
    }));

    return {
      pmsId: odPlan.TreatPlanNum?.toString() || '',
      patientPmsId: odPlan.PatNum?.toString() || '',
      dateCreated: odPlan.DateTP ? new Date(odPlan.DateTP) : new Date(),
      heading: odPlan.Heading || undefined,
      note: odPlan.Note || undefined,
      status: statusMap[odPlan.TPStatus] || 'active',
      procedures,
    };
  }
}
