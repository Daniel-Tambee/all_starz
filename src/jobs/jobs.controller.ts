import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DamageType, Job, JobStatus } from '@prisma/client';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { AiAssessmentPayloadDto } from './dto/ai-assessment-payload.dto.js';
import { CreateEstimateDto } from './dto/create-estimate.dto.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobResponseDto, PaginatedJobsResponseDto } from './dto/job-response.dto.js';
import { QueryJobsDto } from './dto/query-jobs.dto.js';
import { UpdateJobStatusDto } from './dto/update-job-status.dto.js';
import { JobsService } from './jobs.service.js';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a restoration job' })
  @ApiCreatedResponse({ type: JobResponseDto, description: 'Job created' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid request' })
  create(@Body() createJobDto: CreateJobDto): Promise<Job> {
    return this.jobsService.createJob(createJobDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List restoration jobs with optional filters and pagination' })
  @ApiQuery({ name: 'status', enum: JobStatus, required: false })
  @ApiQuery({ name: 'damageType', enum: DamageType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiOkResponse({ type: PaginatedJobsResponseDto, description: 'Paginated jobs' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid query parameters' })
  list(@Query() query: QueryJobsDto) {
    return this.jobsService.listJobs(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve a single restoration job' })
  @ApiOkResponse({ type: JobResponseDto, description: 'Job found' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Job not found' })
  get(@Param('id') id: string): Promise<Job> {
    return this.jobsService.getJob(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the status of a restoration job' })
  @ApiOkResponse({ type: JobResponseDto, description: 'Status updated' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid status value' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Job not found' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Status transition not allowed' })
  updateStatus(@Param('id') id: string, @Body() updateJobStatusDto: UpdateJobStatusDto): Promise<Job> {
    return this.jobsService.updateStatus(id, updateJobStatusDto);
  }

  @Post(':id/estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate and persist the estimated restoration cost' })
  @ApiOkResponse({ type: JobResponseDto, description: 'Estimate calculated and persisted' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid costs' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Job not found' })
  estimate(@Param('id') id: string, @Body() createEstimateDto: CreateEstimateDto): Promise<Job> {
    return this.jobsService.estimateCost(id, createEstimateDto);
  }

  @Post(':id/ai-assessment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Build an AI-ready damage assessment payload' })
  @ApiOkResponse({ type: AiAssessmentPayloadDto, description: 'Structured payload for an AI service' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Job not found' })
  buildAiAssessment(@Param('id') id: string): Promise<AiAssessmentPayloadDto> {
    return this.jobsService.buildAiAssessment(id);
  }
}
