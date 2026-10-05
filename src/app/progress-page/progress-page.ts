import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { Course, CoursesService } from '../courses';
import { AuthService } from '../auth';
import { CourseProgress, ProgressService } from '../progress';
import { EnrollmentsService } from '../enrollments';
import { SiteNav } from '../site-nav/site-nav';

interface LessonRow {
  title: string;
  status: 'passed' | 'waiting' | 'new';
  score: number | null;
  attempts: number;
}

interface CourseRow {
  courseId: string;
  title: string;
  done: number;
  total: number;
  pct: number;
  avg: number | null;
  lessons: LessonRow[];
}

@Component({
  selector: 'app-progress-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteNav],
  templateUrl: './progress-page.html',
  styleUrl: './progress-page.scss'
})
export class ProgressPage implements AfterViewInit {
  private auth = inject(AuthService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  courses = signal<Course[]>([]);
  docs = signal<CourseProgress[]>([]);
  loading = signal(true);
  enrolledIds = signal<ReadonlySet<string>>(new Set());

  rows = computed<CourseRow[]>(() => {
    const out: CourseRow[] = [];
    for (const d of this.docs()) {
      const c = this.courses().find(x => x.id === d.courseId);
      if (!c) continue; // الكورس اتحذف
      const lessons: LessonRow[] = [];
      (c.units ?? []).forEach((u, ui) =>
        u.lessons.forEach((l, li) => {
          // الحصص المقفولة بتتحسب بس للمشترك في الكورس (أو الأدمن)
          if (l.locked && !this.auth.isAdmin() && !this.enrolledIds().has(c.id!)) return;
          const p = d.lessons?.[l.id || `u${ui}l${li}`];
          lessons.push({
            title: l.title,
            status: p?.passed ? 'passed' : p?.watched ? 'waiting' : 'new',
            score: p?.bestScore ?? null,
            attempts: p?.attempts ?? 0
          });
        })
      );
      const done = lessons.filter(l => l.status === 'passed').length;
      const scores = lessons.filter(l => l.score !== null).map(l => l.score as number);
      out.push({
        courseId: d.courseId,
        title: c.title,
        done,
        total: lessons.length,
        pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
        avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        lessons
      });
    }
    return out;
  });

  summary = computed(() => {
    const rows = this.rows();
    const scored = rows.flatMap(r => r.lessons).filter(l => l.score !== null).map(l => l.score as number);
    return {
      courses: rows.length,
      lessons: rows.reduce((s, r) => s + r.done, 0),
      avg: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null
    };
  });

  constructor(coursesService: CoursesService, progressService: ProgressService, enrollmentsService: EnrollmentsService) {
    this.auth.currentUser$
      .pipe(
        map(u => u?.uid ?? null),
        distinctUntilChanged(),
        switchMap(uid =>
          uid ? enrollmentsService.getUserCourseIds(uid).pipe(catchError(() => of([] as string[]))) : of([] as string[])
        ),
        takeUntilDestroyed()
      )
      .subscribe(ids => this.enrolledIds.set(new Set(ids)));

    coursesService.getCourses().pipe(takeUntilDestroyed()).subscribe({
      next: list => this.courses.set(list),
      error: err => console.error(err)
    });

    this.auth.currentUser$
      .pipe(
        map(u => u?.uid ?? null),
        distinctUntilChanged(),
        switchMap(uid =>
          uid ? progressService.getAll(uid).pipe(catchError(() => of([] as CourseProgress[]))) : of([] as CourseProgress[])
        ),
        takeUntilDestroyed()
      )
      .subscribe(list => { this.docs.set(list); this.loading.set(false); });
  }

  // ---- أنيميشن التصميم: عدّاد الأرقام (مفيش تأثير على المنطق) ----
  ngAfterViewInit(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      const seen = new WeakSet<Element>();
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          this.countUp(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      }, { threshold: 0.6 });
      const scan = () => root.querySelectorAll('.stat-num, .ring .pct').forEach(el => {
        if (!seen.has(el)) { seen.add(el); io.observe(el); }
      });
      scan();
      const mo = new MutationObserver(scan);
      mo.observe(root, { childList: true, subtree: true });
      this.destroyRef.onDestroy(() => { io.disconnect(); mo.disconnect(); });
    });
  }

  private countUp(el: HTMLElement): void {
    const original = (el.textContent || '').trim();
    const m = original.match(/^(\D*)(\d+)(\D*)$/);
    if (!m) return; // زي "—"
    const target = parseInt(m[2], 10);
    if (target === 0) return;
    const start = performance.now(), dur = 1400;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = m[1] + Math.round(target * (1 - Math.pow(2, -10 * p))) + m[3];
      if (p < 1) requestAnimationFrame(step); else el.textContent = original;
    };
    requestAnimationFrame(step);
  }
}