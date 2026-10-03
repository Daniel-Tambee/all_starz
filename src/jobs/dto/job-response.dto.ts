import { ApiProperty } from '@nestjs/swagger';
import { DamageType, JobStatus } from '@prisma/client';

export class JobResponseDto {
  @ApiProperty({ example: 'JOB-001' })
  id: string;

  @ApiProperty({ example: 'John Smith' })
  customerName: string;

  @ApiProperty({ example: 'john@example.com' })
  customerEmail: string;

  @ApiProperty({ example: '123 Main Street' })
  propertyAddress: string;

  @ApiProperty({ enum: DamageType, example: DamageType.WATER })
  damageType: DamageType;

  @ApiProperty({ example: 'Water damage affecting the kitchen ceiling and wall.' })
  damageDescription: string;

  @ApiProperty({ example: 450 })
  squareFeet: number;

  @ApiProperty({ enum: JobStatus, example: JobStatus.NEW })
  status: JobStatus;

  @ApiProperty({ example: 4000 })
  estimatedCost: number;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  updatedAt: Date;
}

export class JobPageMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedJobsResponseDto {
  @ApiProperty({ type: [JobResponseDto] })
  data: JobResponseDto[];

  @ApiProperty({ type: JobPageMetaDto })
  meta: JobPageMetaDto;
}
