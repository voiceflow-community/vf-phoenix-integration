class SpanService {
  private spanIds: string[] = [];
  private readonly maxSpans = 50;

  addSpanId(spanId: string) {
    if (this.spanIds.length >= this.maxSpans) {
      this.spanIds.shift(); // Remove oldest span
    }
    this.spanIds.push(spanId);
  }

  getCurrentSpanId(): string | null {
    return this.spanIds.length > 0 ? this.spanIds[this.spanIds.length - 1] : null;
  }

  getNextSpanId(currentSpanId: string): string | null {
    const currentIndex = this.spanIds.indexOf(currentSpanId);
    if (currentIndex === -1 || currentIndex === this.spanIds.length - 1) {
      return null;
    }
    return this.spanIds[currentIndex + 1];
  }

  getAllSpanIds(): string[] {
    return [...this.spanIds].reverse();
  }
}

export const spanService = new SpanService();
