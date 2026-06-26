/** node-cron 최소 타입 선언 (패키지에 .d.ts가 없어 직접 선언). */
declare module "node-cron" {
  export interface ScheduledTask {
    start(): void;
    stop(): void;
  }
  export interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
  }
  export function schedule(
    expression: string,
    func: () => void | Promise<void>,
    options?: ScheduleOptions,
  ): ScheduledTask;
  export function validate(expression: string): boolean;
}
