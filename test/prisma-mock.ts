import { DamageType, Job, JobStatus } from '@prisma/client';

interface JobCreateData {
  id: string;
  jobNumber: number;
  customerName: string;
  customerEmail: string;
  propertyAddress: string;
  damageType: DamageType;
  damageDescription?: string | null;
  squareFeet: number;
  status: JobStatus;
  estimatedCost: number;
}

interface JobSeed {
  id: string;
  jobNumber?: number;
  customerName: string;
  customerEmail: string;
  propertyAddress: string;
  damageType: DamageType;
  damageDescription?: string | null;
  squareFeet: number;
  status?: JobStatus;
  estimatedCost?: number;
}

interface JobWhereInput {
  status?: JobStatus;
  damageType?: DamageType;
}

interface StatusChangeRecord {
  id: string;
  jobId: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedAt: Date;
}

export class PrismaMock {
  readonly statusChanges: StatusChangeRecord[] = [];

  private readonly jobs = new Map<string, Job>();
  private readonly jobRecords: Job[] = [];
  private changeCount = 0;

  readonly job = {
    create: async ({ data }: { data: JobCreateData }): Promise<Job> => {
      const now = new Date();
      const record: Job = {
        ...data,
        damageDescription: data.damageDescription ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.jobs.set(record.id, record);
      this.jobRecords.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { id: string } }): Promise<Job | null> => {
      const record = this.jobs.get(where.id);
      return record ? { ...record } : null;
    },
    findMany: async ({
      where,
      skip = 0,
      take,
    }: {
      where?: JobWhereInput;
      skip?: number;
      take?: number;
    }): Promise<Job[]> => {
      const filtered = this.jobRecords.filter((job) => this.matchesWhere(job, where));
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const bounded = take === undefined ? Infinity : skip + take;
      return filtered.slice(skip, bounded);
    },
    count: async ({ where }: { where?: JobWhereInput }): Promise<number> =>
      this.jobRecords.filter((job) => this.matchesWhere(job, where)).length,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<JobCreateData>;
    }): Promise<Job> => {
      const existing = this.jobs.get(where.id);
      if (!existing) {
        throw new Error(`Job ${where.id} not found`);
      }
      Object.assign(existing, data, { updatedAt: new Date() });
      return existing;
    },
    aggregate: async (): Promise<{ _max: { jobNumber: number | null } }> => {
      let max: number | null = null;
      for (const job of this.jobs.values()) {
        if (max === null || job.jobNumber > max) {
          max = job.jobNumber;
        }
      }
      return { _max: { jobNumber: max } };
    },
  };

  readonly jobStatusChange = {
    create: async ({
      data,
    }: {
      data: { jobId: string; fromStatus: JobStatus | null; toStatus: JobStatus };
    }): Promise<StatusChangeRecord> => {
      this.changeCount += 1;
      const record: StatusChangeRecord = {
        id: `CHG-${this.changeCount}`,
        ...data,
        changedAt: new Date(),
      };
      this.statusChanges.push(record);
      return record;
    },
  };

  readonly $transaction = async (arg: unknown): Promise<unknown> => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(this);
    }
    return Promise.all(arg as Promise<unknown>[]);
  };

  async seed(seedJob: JobSeed): Promise<Job> {
    return this.job.create({
      data: {
        id: seedJob.id,
        jobNumber: seedJob.jobNumber ?? Number(seedJob.id.split('-')[1]),
        customerName: seedJob.customerName,
        customerEmail: seedJob.customerEmail,
        propertyAddress: seedJob.propertyAddress,
        damageType: seedJob.damageType,
        damageDescription: seedJob.damageDescription ?? null,
        squareFeet: seedJob.squareFeet,
        status: seedJob.status ?? JobStatus.NEW,
        estimatedCost: seedJob.estimatedCost ?? 0,
      },
    });
  }

  private matchesWhere(job: Job, where?: JobWhereInput): boolean {
    if (!where) {
      return true;
    }
    if (where.status && job.status !== where.status) {
      return false;
    }
    if (where.damageType && job.damageType !== where.damageType) {
      return false;
    }
    return true;
  }
}

