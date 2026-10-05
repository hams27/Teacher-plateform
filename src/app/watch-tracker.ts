/**
 * بيحسب نسبة المشاهدة الحقيقية للفيديو: بيعدّ الثواني اللي اتشغّلت فعلًا بشكل متواصل،
 * ومبيحسبش الثواني اللي اتعدّت بالتقديم (seek).
 */
export class WatchTracker {
  private seen = new Set<number>();
  private last = -1;
  duration = 0;

  reset(): void {
    this.seen.clear();
    this.last = -1;
    this.duration = 0;
  }

  /** نقطع التتابع (بعد pause / seek / buffering) عشان القفزة متتحسبش */
  breakChain(): void {
    this.last = -1;
  }

  tick(current: number): void {
    if (this.last >= 0) {
      const d = current - this.last;
      // تشغيل عادي (حتى بسرعة 2x) = فرق صغير. أكبر من كده يعتبر تقديم
      if (d >= 0 && d <= 3) {
        for (let s = Math.floor(this.last); s <= Math.floor(current); s++) this.seen.add(s);
      }
    }
    this.last = current;
  }

  get ratio(): number {
    if (!this.duration) return 0;
    return Math.min(1, this.seen.size / Math.ceil(this.duration));
  }
}