import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DamageType } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: 'John Smith', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @MaxLength(254)
  customerEmail: string;

  @ApiProperty({ example: '123 Main Street', minLength: 1, maxLength: 240 })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  propertyAddress: string;

  @ApiProperty({ enum: DamageType, example: DamageType.WATER })
  @IsEnum(DamageType)
  damageType: DamageType;

  @ApiPropertyOptional({
    example: 'Water damage affecting the kitchen ceiling and wall.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  damageDescription?: string;

  @ApiProperty({ example: 450, minimum: 1, maximum: 10000000 })
  @IsInt()
  @Min(1)
  @Max(10000000)
  squareFeet: number;
}
