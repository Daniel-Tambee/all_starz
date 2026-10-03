import { ApiProperty } from '@nestjs/swagger';
import { DamageType } from '@prisma/client';

export class AiAssessmentPropertyDto {
  @ApiProperty({ example: '123 Main Street' })
  address: string;

  @ApiProperty({ example: 450 })
  squareFeet: number;
}

export class AiAssessmentDamageDto {
  @ApiProperty({ enum: DamageType, example: DamageType.WATER })
  type: DamageType;

  @ApiProperty({ example: 'Water damage affecting the kitchen ceiling and wall.' })
  description: string;
}

export class AiAssessmentPayloadDto {
  @ApiProperty({ example: 'JOB-001' })
  jobId: string;

  @ApiProperty({ type: AiAssessmentPropertyDto })
  property: AiAssessmentPropertyDto;

  @ApiProperty({ type: AiAssessmentDamageDto })
  damage: AiAssessmentDamageDto;

  @ApiProperty({ example: 4000 })
  currentEstimate: number;

  @ApiProperty({
    example: 'Analyze the reported property damage and suggest appropriate restoration actions.',
  })
  instructions: string;
}
