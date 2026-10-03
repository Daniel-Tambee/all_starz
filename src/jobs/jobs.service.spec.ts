import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DamageType, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEstimateDto } from './dto/create-estimate.dto.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { QueryJobsDto } from './dto/query-jobs.dto.js';
import { JobsService } from './jobs.service.js';

const validCreateJobDto: CreateJobDto = {
  customerName: 'John Smith',
  customerEmail: 'john@example.com',
  propertyAddress: '123 Main Street',
  damageType: DamageType.WATER,
  damageDescription: 'Water damage affecting the kitchen ceiling and wall.',
  squareFeet: 450,
};

const buildPrismaMock = () => {
  type AnyFn = (arg?: any) => any;
  const job = {
    aggregate: jest.fn<AnyFn>(),
    create: jest.fn<AnyFn>(),
    findUnique: jest.fn<AnyFn>(),
    findMany: jest.fn<AnyFn>(),
    count: jest.fn<AnyFn>(),
    update: jest.fn<AnyFn>(),
  };
  const jobStatusChange = { create: jest.fn<AnyFn>() };
  const client = { job, jobStatusChange };
  const $transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(client);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return { $transaction, ...client };
};

const createdJobRecord = (data: { id: string; jobNumber: number }) => ({
  id: data.id,
  jobNumber: data.jobNumber,
  customerName: 'John Smith',
  customerEmail: 'john@example.com',
  propertyAddress: '123 Main Street',
  damageType: DamageType.WATER,
  damageDescription: 'Water damage affecting the kitchen ceiling and wall.',
  squareFeet: 450,
  status: JobStatus.NEW,
  estimatedCost: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('JobsService', () => {
  let service: JobsService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prismaMock = buildPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [JobsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(JobsService);
  });

  describe('createJob', () => {
    it('creates the first job with id JOB-001, status NEW and zero estimated cost', async () => {
      prismaMock.job.aggregate.mockResolvedValue({ _max: { jobNumber: null } });
      prismaMock.job.create.mockImplementation(async ({ data }: { data: { id: string; jobNumber: number } }) =>
        createdJobRecord(data),
      );

      const result = await service.createJob(validCreateJobDto);

      expect(result.id).toBe('JOB-001');
      expect(result.status).toBe(JobStatus.NEW);
      expect(result.estimatedCost).toBe(0);
      expect(prismaMock.jobStatusChange.create).toHaveBeenCalledWith({
        data: { jobId: 'JOB-001', fromStatus: null, toStatus: JobStatus.NEW },
      });
    });

    it('continues the sequence beyond the highest existing job number', async () => {
      prismaMock.job.aggregate.mockResolvedValue({ _max: { jobNumber: 12 } });
      prismaMock.job.create.mockImplementation(async ({ data }: { data: { id: string; jobNumber: number } }) =>
        createdJobRecord(data),
      );

      const result = await service.createJob(validCreateJobDto);

      expect(result.id).toBe('JOB-013');
      expect(result.jobNumber).toBe(13);
    });

    it('retries when a concurrent request claims the same job id', async () => {
      const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prismaMock.job.aggregate.mockResolvedValue({ _max: { jobNumber: null } });
      prismaMock.job.create
        .mockRejectedValueOnce(uniqueViolation)
        .mockResolvedValueOnce(createdJobRecord({ id: 'JOB-001', jobNumber: 1 }));

      const result = await service.createJob(validCreateJobDto);

      expect(result.id).toBe('JOB-001');
      expect(prismaMock.job.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('getJob', () => {
    it('returns the job when it exists', async () => {
      const job = createdJobRecord({ id: 'JOB-001', jobNumber: 1 });
      prismaMock.job.findUnique.mockResolvedValue(job);

      await expect(service.getJob('JOB-001')).resolves.toEqual(job);
    });

    it('throws NotFoundException when the job does not exist', async () => {
      prismaMock.job.findUnique.mockResolvedValue(null);

      await expect(service.getJob('JOB-999')).rejects.toThrow(NotFoundException);
      await expect(service.getJob('JOB-999')).rejects.toThrow('Job not found');
    });
  });

  describe('updateStatus', () => {
    it('allows a valid transition and records it in the audit trail', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001', status: JobStatus.NEW });
      prismaMock.job.update.mockResolvedValue({ id: 'JOB-001', status: JobStatus.INSPECTION });

      const result = await service.updateStatus('JOB-001', { status: JobStatus.INSPECTION });

      expect(result.status).toBe(JobStatus.INSPECTION);
      expect(prismaMock.jobStatusChange.create).toHaveBeenCalledWith({
        data: { jobId: 'JOB-001', fromStatus: JobStatus.NEW, toStatus: JobStatus.INSPECTION },
      });
    });

    it('rejects COMPLETED to ESTIMATING', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001', status: JobStatus.COMPLETED });

      await expect(service.updateStatus('JOB-001', { status: JobStatus.ESTIMATING })).rejects.toThrow(
        ConflictException,
      );
      await expect(service.updateStatus('JOB-001', { status: JobStatus.ESTIMATING })).rejects.toThrow(
        'Cannot transition job from COMPLETED to ESTIMATING',
      );
      expect(prismaMock.job.update).not.toHaveBeenCalled();
    });

    it('rejects CANCELLED to IN_PROGRESS', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001', status: JobStatus.CANCELLED });

      await expect(service.updateStatus('JOB-001', { status: JobStatus.IN_PROGRESS })).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.job.update).not.toHaveBeenCalled();
    });

    it('rejects a transition to the current status', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001', status: JobStatus.NEW });

      await expect(service.updateStatus('JOB-001', { status: JobStatus.NEW })).rejects.toThrow(
        'Job is already in status NEW',
      );
    });

    it('throws NotFoundException for an unknown job', async () => {
      prismaMock.job.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('JOB-999', { status: JobStatus.INSPECTION })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('estimateCost', () => {
    const estimateDto: CreateEstimateDto = {
      laborCost: 1500,
      materialCost: 2000,
      equipmentCost: 500,
    };

    it('sums all costs and persists the total', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001' });
      prismaMock.job.update.mockResolvedValue({ id: 'JOB-001', estimatedCost: 4000 });

      const result = await service.estimateCost('JOB-001', estimateDto);

      expect(result.estimatedCost).toBe(4000);
      expect(prismaMock.job.update).toHaveBeenCalledWith({
        where: { id: 'JOB-001' },
        data: { estimatedCost: 4000 },
      });
    });

    it('rounds the total to two decimal places', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001' });
      prismaMock.job.update.mockResolvedValue({ id: 'JOB-001', estimatedCost: 0.6 });

      await service.estimateCost('JOB-001', {
        laborCost: 0.1,
        materialCost: 0.2,
        equipmentCost: 0.3,
      });

      expect(prismaMock.job.update).toHaveBeenCalledWith({
        where: { id: 'JOB-001' },
        data: { estimatedCost: 0.6 },
      });
    });

    it('rejects negative costs', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001' });

      await expect(
        service.estimateCost('JOB-001', { ...estimateDto, equipmentCost: -500 }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.job.update).not.toHaveBeenCalled();
    });

    it('rejects non-numeric costs', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'JOB-001' });

      await expect(
        service.estimateCost('JOB-001', { ...estimateDto, laborCost: Number.NaN }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown job', async () => {
      prismaMock.job.findUnique.mockResolvedValue(null);

      await expect(service.estimateCost('JOB-999', estimateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listJobs', () => {
    it('applies filters and pagination and returns metadata', async () => {
      prismaMock.job.findMany.mockResolvedValue([]);
      prismaMock.job.count.mockResolvedValue(45);
      const query: QueryJobsDto = {
        status: JobStatus.ESTIMATING,
        damageType: DamageType.WATER,
        page: 2,
        limit: 5,
      };

      const result = await service.listJobs(query);

      expect(prismaMock.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: JobStatus.ESTIMATING, damageType: DamageType.WATER },
          skip: 5,
          take: 5,
        }),
      );
      expect(result.meta).toEqual({ page: 2, limit: 5, total: 45, totalPages: 9 });
    });

    it('defaults to the first page with a limit of twenty', async () => {
      prismaMock.job.findMany.mockResolvedValue([]);
      prismaMock.job.count.mockResolvedValue(0);

      const result = await service.listJobs({});

      expect(prismaMock.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
    });
  });

  describe('buildAiAssessment', () => {
    it('builds a structured payload for the AI service', async () => {
      prismaMock.job.findUnique.mockResolvedValue({
        id: 'JOB-001',
        propertyAddress: '123 Main Street',
        squareFeet: 450,
        damageType: DamageType.WATER,
        damageDescription: 'Water damage affecting the kitchen ceiling and wall.',
        estimatedCost: 4000,
      });

      const payload = await service.buildAiAssessment('JOB-001');

      expect(payload).toEqual({
        jobId: 'JOB-001',
        property: { address: '123 Main Street', squareFeet: 450 },
        damage: { type: DamageType.WATER, description: 'Water damage affecting the kitchen ceiling and wall.' },
        currentEstimate: 4000,
        instructions: 'Analyze the reported property damage and suggest appropriate restoration actions.',
      });
    });

    it('uses an empty description when the job has none', async () => {
      prismaMock.job.findUnique.mockResolvedValue({
        id: 'JOB-002',
        propertyAddress: '45 Oak Avenue',
        squareFeet: 1200,
        damageType: DamageType.FIRE,
        damageDescription: null,
        estimatedCost: 0,
      });

      const payload = await service.buildAiAssessment('JOB-002');

      expect(payload.damage.description).toBe('');
    });

    it('throws NotFoundException for an unknown job', async () => {
      prismaMock.job.findUnique.mockResolvedValue(null);

      await expect(service.buildAiAssessment('JOB-999')).rejects.toThrow(NotFoundException);
    });
  });
});
