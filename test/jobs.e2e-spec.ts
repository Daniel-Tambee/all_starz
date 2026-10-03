import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DamageType, JobStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PrismaMock } from './prisma-mock.js';

describe('Jobs API (e2e)', () => {
  let app: INestApplication;
  let prismaMock: PrismaMock;

  const validPayload = {
    customerName: 'John Smith',
    customerEmail: 'john@example.com',
    propertyAddress: '123 Main Street',
    damageType: 'WATER',
    damageDescription: 'Water damage affecting the kitchen ceiling and wall.',
    squareFeet: 450,
  };

  const createJob = (payload: Record<string, unknown> = validPayload) =>
    request(app.getHttpServer()).post('/jobs').send(payload);

  const updateStatus = (id: string, status: string) =>
    request(app.getHttpServer()).patch(`/jobs/${id}/status`).send({ status });

  const estimate = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/jobs/${id}/estimate`).send(body);

  beforeEach(async () => {
    prismaMock = new PrismaMock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /jobs', () => {
    it('creates a job with a generated id, NEW status and zero estimated cost', async () => {
      const response = await createJob();

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'JOB-001',
        customerName: 'John Smith',
        customerEmail: 'john@example.com',
        propertyAddress: '123 Main Street',
        damageType: 'WATER',
        damageDescription: 'Water damage affecting the kitchen ceiling and wall.',
        squareFeet: 450,
        status: 'NEW',
        estimatedCost: 0,
      });
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('records the initial status in the audit trail', async () => {
      await createJob();

      expect(prismaMock.statusChanges).toHaveLength(1);
      expect(prismaMock.statusChanges[0]).toMatchObject({
        jobId: 'JOB-001',
        fromStatus: null,
        toStatus: JobStatus.NEW,
      });
    });

    it('assigns incrementing unique job ids', async () => {
      await createJob();
      const second = await createJob({ ...validPayload, customerEmail: 'jane@example.com' });

      expect(second.body.id).toBe('JOB-002');
    });

    it('rejects a request with missing required fields', async () => {
      const response = await createJob({ customerName: 'John Smith' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('customerEmail');
    });

    it('rejects an invalid email address', async () => {
      const response = await createJob({ ...validPayload, customerEmail: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('customerEmail');
    });

    it('rejects an invalid damage type', async () => {
      const response = await createJob({ ...validPayload, damageType: 'FLOOD' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('damageType');
    });

    it('rejects an invalid square footage', async () => {
      const response = await createJob({ ...validPayload, squareFeet: 0 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('squareFeet');
    });

    it('rejects unknown properties', async () => {
      const response = await createJob({ ...validPayload, estimatedCost: 999 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('estimatedCost');
    });
  });

  describe('GET /jobs', () => {
    it('returns all jobs wrapped in pagination metadata', async () => {
      await createJob();
      await createJob({ ...validPayload, customerEmail: 'jane@example.com', damageType: 'FIRE' });

      const response = await request(app.getHttpServer()).get('/jobs');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    });

    it('filters by status', async () => {
      await createJob();
      await createJob({ ...validPayload, customerEmail: 'jane@example.com' });
      await updateStatus('JOB-002', 'INSPECTION');

      const response = await request(app.getHttpServer()).get('/jobs?status=INSPECTION');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('JOB-002');
    });

    it('filters by damage type', async () => {
      await createJob();
      await createJob({ ...validPayload, customerEmail: 'jane@example.com', damageType: 'FIRE' });

      const response = await request(app.getHttpServer()).get('/jobs?damageType=FIRE');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('JOB-002');
    });

    it('combines status and damage type filters', async () => {
      await createJob();
      await createJob({ ...validPayload, customerEmail: 'jane@example.com', damageType: 'FIRE' });
      await updateStatus('JOB-001', 'INSPECTION');

      const response = await request(app.getHttpServer()).get('/jobs?status=INSPECTION&damageType=FIRE');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });

    it('paginates results', async () => {
      for (let index = 1; index <= 25; index += 1) {
        await createJob({ ...validPayload, customerEmail: `customer-${index}@example.com` });
      }

      const pageTwo = await request(app.getHttpServer()).get('/jobs?page=2&limit=10');
      const pageThree = await request(app.getHttpServer()).get('/jobs?page=3&limit=10');

      expect(pageTwo.status).toBe(200);
      expect(pageTwo.body.data).toHaveLength(10);
      expect(pageTwo.body.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
      expect(pageThree.body.data).toHaveLength(5);
    });

    it('rejects an invalid filter value', async () => {
      const response = await request(app.getHttpServer()).get('/jobs?status=NOPE');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /jobs/:id', () => {
    it('returns an existing job', async () => {
      await createJob();

      const response = await request(app.getHttpServer()).get('/jobs/JOB-001');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('JOB-001');
      expect(response.body.customerEmail).toBe('john@example.com');
    });

    it('returns a 404 error for a non-existent job', async () => {
      const response = await request(app.getHttpServer()).get('/jobs/JOB-999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, message: 'Job not found' });
    });
  });

  describe('PATCH /jobs/:id/status', () => {
    it('applies a valid transition and records it in the audit trail', async () => {
      await createJob();

      const response = await updateStatus('JOB-001', 'INSPECTION');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('INSPECTION');
      expect(prismaMock.statusChanges).toHaveLength(2);
      expect(prismaMock.statusChanges[1]).toMatchObject({
        jobId: 'JOB-001',
        fromStatus: JobStatus.NEW,
        toStatus: JobStatus.INSPECTION,
      });
    });

    it('rejects an invalid status value', async () => {
      await createJob();

      const response = await updateStatus('JOB-001', 'FINISHED');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('status');
    });

    it('rejects a transition to the current status', async () => {
      await createJob();

      const response = await updateStatus('JOB-001', 'NEW');

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('already in status');
    });

    it('rejects COMPLETED to ESTIMATING', async () => {
      await prismaMock.seed({
        id: 'JOB-100',
        customerName: 'Noah Williams',
        customerEmail: 'noah.williams@example.com',
        propertyAddress: '14 Birch Lane',
        damageType: DamageType.OTHER,
        squareFeet: 300,
        status: JobStatus.COMPLETED,
        estimatedCost: 5200,
      });

      const response = await updateStatus('JOB-100', 'ESTIMATING');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        message: 'Cannot transition job from COMPLETED to ESTIMATING',
      });
    });

    it('rejects CANCELLED to IN_PROGRESS', async () => {
      await prismaMock.seed({
        id: 'JOB-101',
        customerName: 'Ava Johnson',
        customerEmail: 'ava.johnson@example.com',
        propertyAddress: '772 Riverside Drive',
        damageType: DamageType.STORM,
        squareFeet: 2200,
        status: JobStatus.CANCELLED,
      });

      const response = await updateStatus('JOB-101', 'IN_PROGRESS');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        message: 'Cannot transition job from CANCELLED to IN_PROGRESS',
      });
    });

    it('returns a 404 error for a non-existent job', async () => {
      const response = await updateStatus('JOB-999', 'INSPECTION');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Job not found');
    });
  });

  describe('POST /jobs/:id/estimate', () => {
    it('calculates the total and persists it against the job', async () => {
      await createJob();

      const response = await estimate('JOB-001', {
        laborCost: 1500,
        materialCost: 2000,
        equipmentCost: 500,
      });

      expect(response.status).toBe(200);
      expect(response.body.estimatedCost).toBe(4000);

      const fetched = await request(app.getHttpServer()).get('/jobs/JOB-001');
      expect(fetched.body.estimatedCost).toBe(4000);
    });

    it('rejects negative costs', async () => {
      await createJob();

      const response = await estimate('JOB-001', {
        laborCost: 1500,
        materialCost: 2000,
        equipmentCost: -500,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects missing costs', async () => {
      await createJob();

      const response = await estimate('JOB-001', { laborCost: 1500, materialCost: 2000 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('equipmentCost');
    });

    it('rejects non-numeric costs', async () => {
      await createJob();

      const response = await estimate('JOB-001', {
        laborCost: 'fifteen hundred',
        materialCost: 2000,
        equipmentCost: 500,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('laborCost');
    });

    it('returns a 404 error for a non-existent job', async () => {
      const response = await estimate('JOB-999', {
        laborCost: 1500,
        materialCost: 2000,
        equipmentCost: 500,
      });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Job not found');
    });
  });

  describe('POST /jobs/:id/ai-assessment', () => {
    it('returns a structured AI-ready payload', async () => {
      await createJob();
      await estimate('JOB-001', { laborCost: 1500, materialCost: 2000, equipmentCost: 500 });

      const response = await request(app.getHttpServer()).post('/jobs/JOB-001/ai-assessment');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        jobId: 'JOB-001',
        property: { address: '123 Main Street', squareFeet: 450 },
        damage: {
          type: 'WATER',
          description: 'Water damage affecting the kitchen ceiling and wall.',
        },
        currentEstimate: 4000,
        instructions: 'Analyze the reported property damage and suggest appropriate restoration actions.',
      });
    });

    it('returns a 404 error for a non-existent job', async () => {
      const response = await request(app.getHttpServer()).post('/jobs/JOB-999/ai-assessment');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, message: 'Job not found' });
    });
  });
});
