export interface StudioOptions {
  port?: number;
  host?: string;
  open?: boolean;
}

export interface StudioServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly url: string;
}
