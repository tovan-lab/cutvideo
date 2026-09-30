import fs from 'fs/promises';
import { INPAINTING_CONFIG } from '../config/inpaintingConfig';

export interface InpaintingProviderAvailability {
  available: boolean;
  provider: string;
  configured: boolean;
  model: string;
  version?: string;
  reason?: string;
  providerReady: boolean;
}

export interface InpaintingJobPayload {
  videoPath: string;
  maskPath: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
}

export interface IInpaintingProvider {
  name: string;
  checkAvailability(): Promise<InpaintingProviderAvailability>;
  createJob(
    payload: InpaintingJobPayload,
    signal?: AbortSignal
  ): Promise<{ providerJobId: string }>;
  getJobStatus(providerJobId: string): Promise<{
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    outputUrl?: string;
    error?: string;
  }>;
  cancelJob(providerJobId: string): Promise<void>;
}

/**
 * Replicate Inpainting Provider Adapter
 * Connects to specialized Neural Video Inpainting models (e.g. ProPainter)
 */
export class ReplicateInpaintingProvider implements IInpaintingProvider {
  name = 'replicate';

  private getApiToken(): string | null {
    return process.env.REPLICATE_API_TOKEN || null;
  }

  async checkAvailability(): Promise<InpaintingProviderAvailability> {
    const token = this.getApiToken();
    const model = INPAINTING_CONFIG.MODEL;
    const version = INPAINTING_CONFIG.VERSION;

    if (!token) {
      return {
        available: false,
        provider: this.name,
        configured: false,
        model,
        version,
        reason: 'Chưa cấu hình REPLICATE_API_TOKEN trong Settings > Secrets của AI Studio.',
        providerReady: false,
      };
    }

    return {
      available: true,
      provider: this.name,
      configured: true,
      model,
      version,
      providerReady: true,
    };
  }

  async createJob(
    payload: InpaintingJobPayload,
    signal?: AbortSignal
  ): Promise<{ providerJobId: string }> {
    const token = this.getApiToken();
    if (!token) {
      throw new Error('Chưa cấu hình REPLICATE_API_TOKEN trong Settings > Secrets.');
    }

    // Read video and mask files to base64 Data URIs for Replicate
    const videoBuffer = await fs.readFile(payload.videoPath);
    const maskBuffer = await fs.readFile(payload.maskPath);

    const videoDataUri = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;
    const maskDataUri = `data:image/png;base64,${maskBuffer.toString('base64')}`;

    // Target Replicate predictions API (supports both model route and version route)
    const isVersionRoute = Boolean(INPAINTING_CONFIG.VERSION);
    const endpoint = isVersionRoute
      ? 'https://api.replicate.com/v1/predictions'
      : `https://api.replicate.com/v1/models/${INPAINTING_CONFIG.MODEL}/predictions`;

    const requestBody: Record<string, unknown> = {
      input: {
        video: videoDataUri,
        mask: maskDataUri,
        mode: 'video_inpainting',
        fp16: true, // Use FP16 for optimal GPU memory and speed
      },
    };

    if (isVersionRoute) {
      requestBody.version = INPAINTING_CONFIG.VERSION;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errorMsg = `Replicate API error (${response.status})`;
      try {
        const parsed = JSON.parse(errBody);
        errorMsg = parsed.detail || parsed.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await response.json();
    return {
      providerJobId: data.id,
    };
  }

  async getJobStatus(providerJobId: string): Promise<{
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    outputUrl?: string;
    error?: string;
  }> {
    const token = this.getApiToken();
    if (!token) {
      throw new Error('Chưa cấu hình REPLICATE_API_TOKEN.');
    }

    const response = await fetch(`https://api.replicate.com/v1/predictions/${providerJobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Không thể kiểm tra trạng thái job trên Replicate (${response.status})`);
    }

    const data = await response.json();
    let status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled' = 'processing';

    if (data.status === 'starting') status = 'starting';
    else if (data.status === 'processing') status = 'processing';
    else if (data.status === 'succeeded') status = 'succeeded';
    else if (data.status === 'failed') status = 'failed';
    else if (data.status === 'canceled') status = 'canceled';

    let outputUrl: string | undefined;
    if (typeof data.output === 'string') {
      outputUrl = data.output;
    } else if (Array.isArray(data.output) && data.output.length > 0) {
      outputUrl = data.output[0];
    }

    return {
      status,
      outputUrl,
      error: data.error,
    };
  }

  async cancelJob(providerJobId: string): Promise<void> {
    const token = this.getApiToken();
    if (!token) return;

    try {
      await fetch(`https://api.replicate.com/v1/predictions/${providerJobId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.warn(`Failed to cancel Replicate prediction ${providerJobId}:`, err);
    }
  }
}

export const inpaintingProvider: IInpaintingProvider = new ReplicateInpaintingProvider();
