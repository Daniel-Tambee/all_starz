import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DamageType, Job, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiAssessmentPayloadDto } from './dto/ai-assessment-payload.dto.js';
import { CreateEstimateDto } from './dto/create-estimate.dto.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { QueryJobsDto } from './dto/query-jobs.dto.js';
import { UpdateJobStatusDto } from './dto/update-job-status.dto.js';

const ALLOWED_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.NEW]: [JobStatus.INSPECTION, JobStatus.ESTIMATING, JobStatus.CANCELLED],
  [JobStatus.INSPECTION]: [JobStatus.ESTIMATING, JobStatus.CANCELLED],
  [JobStatus.ESTIMATING]: [JobStatus.PROPOSAL_SENT, JobStatus.CANCELLED],
  [JobStatus.PROPOSAL_SENT]: [JobStatus.APPROVED, JobStatus.CANCELLED],
  [JobStatus.APPROVED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [],
};

const AI_ASSESSMENT_INSTRUCTIONS =
  'Analyze the reported property damage and suggest appropriate restoration actions.';

const MAX_JOB_ID_ATTEMPTS = 3;

export interface PaginatedJobs {
  data: Job[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(dto: CreateJobDto): Promise<Job> {
    for (let attempt = 1; attempt <= MAX_JOB_ID_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const jobNumber = await this.nextJobNumber(tx);
          const job = await tx.job.create({
            data: {
              id: `JOB-${String(jobNumber).padStart(3, '0')}`,
              jobNumber,
              customerName: dto.customerName.trim(),
              customerEmail: dto.customerEmail.trim().toLowerCase(),
              propertyAddress: dto.propertyAddress.trim(),
              damageType: dto.damageType,
              damageDescription: dto.damageDescription?.trim(),
              squareFeet: dto.squareFeet,
              status: JobStatus.NEW,
              estimatedCost: 0,
            },
          });
          await tx.jobStatusChange.create({
            data: { jobId: job.id, fromStatus: null, toStatus: JobStatus.NEW },
          });
          return job;
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error) || attempt === MAX_JOB_ID_ATTEMPTS) {
          throw error;
        }
      }
    }
    throw new InternalServerErrorException('Failed to generate a unique job id');
  }

  async listJobs(query: QueryJobsDto): Promise<PaginatedJobs> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.JobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.damageType ? { damageType: query.damageType } : {}),
    };
    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);
    return {
      data: jobs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getJob(id: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  async updateStatus(id: string, dto: UpdateJobStatusDto): Promise<Job> {
    const job = await this.getJob(id);
    if (job.status === dto.status) {
      throw new ConflictException(`Job is already in status ${dto.status}`);
    }
    const allowedTargets = ALLOWED_STATUS_TRANSITIONS[job.status] ?? [];
    if (!allowedTargets.includes(dto.status)) {
      throw new ConflictException(`Cannot transition job from ${job.status} to ${dto.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.jobStatusChange.create({
        data: { jobId: id, fromStatus: job.status, toStatus: dto.status },
      });
      return updated;
    });
  }

  async estimateCost(id: string, dto: CreateEstimateDto): Promise<Job> {
    await this.getJob(id);
    const costs = [dto.laborCost, dto.materialCost, dto.equipmentCost];
    const hasInvalidCost = costs.some(
      (cost) => typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0,
    );
    if (hasInvalidCost) {
      throw new BadRequestException('laborCost, materialCost and equipmentCost must be non-negative numbers');
    }
    const estimatedCost = this.roundCurrency(costs[0] + costs[1] + costs[2]);
    return this.prisma.job.update({
      where: { id },
      data: { estimatedCost },
    });
  }

  async buildAiAssessment(id: string): Promise<AiAssessmentPayloadDto> {
    const job = await this.getJob(id);
    return {
      jobId: job.id,
      property: {
        address: job.propertyAddress,
        squareFeet: job.squareFeet,
      },
      damage: {
        type: job.damageType,
        description: job.damageDescription ?? '',
      },
      currentEstimate: job.estimatedCost,
      instructions: AI_ASSESSMENT_INSTRUCTIONS,
    };
  }

  private async nextJobNumber(tx: Prisma.TransactionClient): Promise<number> {
    const aggregate = await tx.job.aggregate({ _max: { jobNumber: true } });
    return (aggregate._max.jobNumber ?? 0) + 1;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
