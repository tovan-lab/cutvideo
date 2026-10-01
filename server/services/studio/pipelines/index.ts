import type { PipelineDefinition, PipelineId } from '../types';
import { topicPipeline } from './topicPipeline';
import { newsPipeline } from './newsPipeline';
import { marketingPipeline } from './marketingPipeline';

export const PIPELINES: Record<PipelineId, PipelineDefinition> = {
  topic: topicPipeline,
  news: newsPipeline,
  marketing: marketingPipeline,
};
