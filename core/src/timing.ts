/** Đồng hồ đo thời gian từng khâu. */
export class Stopwatch {
  private t0 = performance.now();
  private marks = new Map<string, number>();

  mark(name: string): number {
    const v = performance.now() - this.t0;
    if (!this.marks.has(name)) this.marks.set(name, v);
    return v;
  }

  get(name: string): number | undefined {
    const v = this.marks.get(name);
    return v === undefined ? undefined : Math.round(v);
  }

  elapsed(): number {
    return Math.round(performance.now() - this.t0);
  }
}
