import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CreateEstimateDto {
  @ApiProperty({ example: 1500, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  laborCost: number;

  @ApiProperty({ example: 2000, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  materialCost: number;

  @ApiProperty({ example: 500, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  equipmentCost: number;
}
