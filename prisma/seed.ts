import { DamageType, JobStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedJob {
  id: string;
  customerName: string;
  customerEmail: string;
  propertyAddress: string;
  damageType: DamageType;
  damageDescription: string;
  squareFeet: number;
  status: JobStatus;
  estimatedCost: number;
  statusHistory: JobStatus[];
}

const seedJobs: SeedJob[] = [
  {
    id: 'JOB-001',
    customerName: 'John Smith',
    customerEmail: 'john@example.com',
    propertyAddress: '123 Main Street',
    damageType: DamageType.WATER,
    damageDescription: 'Water damage affecting the kitchen ceiling and wall.',
    squareFeet: 450,
    status: JobStatus.ESTIMATING,
    estimatedCost: 4000,
    statusHistory: [JobStatus.NEW, JobStatus.INSPECTION, JobStatus.ESTIMATING],
  },
  {
    id: 'JOB-002',
    customerName: 'Maria Garcia',
    customerEmail: 'maria.garcia@example.com',
    propertyAddress: '45 Oak Avenue',
    damageType: DamageType.FIRE,
    damageDescription: 'Kitchen fire with smoke damage throughout the ground floor.',
    squareFeet: 1200,
    status: JobStatus.PROPOSAL_SENT,
    estimatedCost: 18500,
    statusHistory: [JobStatus.NEW, JobStatus.INSPECTION, JobStatus.ESTIMATING, JobStatus.PROPOSAL_SENT],
  },
  {
    id: 'JOB-003',
    customerName: 'Liam Chen',
    customerEmail: 'liam.chen@example.com',
    propertyAddress: '8 Pine Court',
    damageType: DamageType.MOLD,
    damageDescription: 'Mold growth detected in the basement bathroom.',
    squareFeet: 200,
    status: JobStatus.NEW,
    estimatedCost: 0,
    statusHistory: [JobStatus.NEW],
  },
  {
    id: 'JOB-004',
    customerName: 'Ava Johnson',
    customerEmail: 'ava.johnson@example.com',
    propertyAddress: '772 Riverside Drive',
    damageType: DamageType.STORM,
    damageDescription: 'Roof and siding damage after a hailstorm.',
    squareFeet: 2200,
    status: JobStatus.IN_PROGRESS,
    estimatedCost: 14375.5,
    statusHistory: [
      JobStatus.NEW,
      JobStatus.INSPECTION,
      JobStatus.ESTIMATING,
      JobStatus.PROPOSAL_SENT,
      JobStatus.APPROVED,
      JobStatus.IN_PROGRESS,
    ],
  },
  {
    id: 'JOB-005',
    customerName: 'Noah Williams',
    customerEmail: 'noah.williams@example.com',
    propertyAddress: '14 Birch Lane',
    damageType: DamageType.OTHER,
    damageDescription: 'Vandalism damage to the front entrance and windows.',
    squareFeet: 300,
    status: JobStatus.COMPLETED,
    estimatedCost: 5200,
    statusHistory: [
      JobStatus.NEW,
      JobStatus.INSPECTION,
      JobStatus.ESTIMATING,
      JobStatus.PROPOSAL_SENT,
      JobStatus.APPROVED,
      JobStatus.IN_PROGRESS,
      JobStatus.COMPLETED,
    ],
  },
];

async function main(): Promise<void> {
  for (const seedJob of seedJobs) {
    const jobNumber = Number(seedJob.id.split('-')[1]);
    const job = await prisma.job.upsert({
      where: { id: seedJob.id },
      update: {
        customerName: seedJob.customerName,
        customerEmail: seedJob.customerEmail,
        propertyAddress: seedJob.propertyAddress,
        damageType: seedJob.damageType,
        damageDescription: seedJob.damageDescription,
        squareFeet: seedJob.squareFeet,
        status: seedJob.status,
        estimatedCost: seedJob.estimatedCost,
      },
      create: {
        id: seedJob.id,
        jobNumber,
        customerName: seedJob.customerName,
        customerEmail: seedJob.customerEmail,
        propertyAddress: seedJob.propertyAddress,
        damageType: seedJob.damageType,
        damageDescription: seedJob.damageDescription,
        squareFeet: seedJob.squareFeet,
        status: seedJob.status,
        estimatedCost: seedJob.estimatedCost,
      },
    });

    const existingChanges = await prisma.jobStatusChange.count({ where: { jobId: job.id } });
    if (existingChanges === 0) {
      let previousStatus: JobStatus | null = null;
      for (const status of seedJob.statusHistory) {
        await prisma.jobStatusChange.create({
          data: { jobId: job.id, fromStatus: previousStatus, toStatus: status },
        });
        previousStatus = status;
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
