import { ApiPropertyOptional } from '@nestjs/swagger';
import { DamageType, JobStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryJobsDto {
  @ApiPropertyOptional({ enum: JobStatus, example: JobStatus.ESTIMATING })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ enum: DamageType, example: DamageType.WATER })
  @IsOptional()
  @IsEnum(DamageType)
  damageType?: DamageType;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
