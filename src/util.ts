export function nowIso(): string {
  return new Date().toISOString();
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
