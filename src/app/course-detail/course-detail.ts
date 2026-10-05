import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { CoursesService, Unit, Lesson, QuizQuestion } from '../courses';
import { AuthService } from '../auth';
import { FavoritesService } from '../favorites';
import { RatingsService, Rating } from '../ratings';
import { EnrollmentsService } from '../enrollments';
import { SITE } from '../site-config';
import { ProgressService, LessonProgress, PASS_PERCENT } from '../progress';
import { SiteNav } from '../site-nav/site-nav';
import { toEmbed } from '../video-utils';
import { loadYouTubeApi } from '../youtube-api';
import { WatchTracker } from '../watch-tracker';

interface Player {
  kind: 'youtube' | 'iframe' | 'video';
  iframeSrc: SafeResourceUrl | null;
  videoSrc: string | null;
}

interface CurrentLesson {
  id: string;
  title: string;
}

interface FlatLesson {
  key: string;
  ui: number;
  li: number;
  lesson: Lesson;
}

type LessonState = 'passed' | 'open' | 'seqlocked' | 'sublocked' | 'needlogin';

interface Toast {
  kind: 'rate' | 'thanks' | 'login' | 'error';
  lessonId?: string;
  lessonTitle?: string;
  stars?: number;
}

/** أقل نسبة مشاهدة عشان نعتبر الدرس اتشاف كامل */
const WATCH_THRESHOLD = 0.9;

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteNav],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss'
})
export class CourseDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private coursesService = inject(CoursesService);
  private ratingsService = inject(RatingsService);
  private progressService = inject(ProgressService);
  private enrollmentsService = inject(EnrollmentsService);
  private sanitizer = inject(DomSanitizer);
  auth = inject(AuthService);
  fav = inject(FavoritesService);

  readonly passPercent = PASS_PERCENT;

  activeTab: 'description' | 'content' | 'reviews' = 'description';
  expandedUnit: number | null = 0;

  state = signal<'loading' | 'ready' | 'closed' | 'notfound'>('loading');

  course = signal({
    id: '',
    title: '',
    tag: '',
    shortDesc: '',
    fullDesc: '',
    outcomes: [] as string[],
    includes: [] as string[],
    price: 0,
    addedAt: '',
    instructorName: SITE.teacherName,
    instructorRole: SITE.teacherRole
  });

  // أول حرفين من اسم المدرس للأفاتار (من غير "أ.")
  instructorInitials = computed(() => {
    const words = this.course().instructorName.replace(/^أ\.?\s*/, '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(w => w[0]).join('.');
  });
  units = signal<Unit[]>([]);

  // ---- المشغّل ----
  player = signal<Player | null>(null);
  playingTitle = signal('');
  currentLesson = signal<CurrentLesson | null>(null);
  lockedMsg = signal('');
  watchPct = signal(0);
  watchMsg = signal('');

  // ---- التقدم والامتحان ----
  progress = signal<Record<string, LessonProgress>>({});
  answers = signal<number[]>([]);
  quizResult = signal<{ score: number; passed: boolean; wrong: number[] } | null>(null);
  retaking = signal(false);
  savingQuiz = signal(false);

  // ---- الاشتراك ----
  enrolled = signal(false);
  enrolling = signal(false);
  enrollMsg = signal('');
  // الأدمن والمشترك بيفتحوا الحصص المقفولة للمشتركين
  canAccessLocked = computed(() => this.auth.isAdmin() || this.enrolled());

  // ---- التقييمات ----
  ratings = signal<Rating[]>([]);
  toast = signal<Toast | null>(null);
  hover = signal(0);
  starsArr = [1, 2, 3, 4, 5];

  // كل الدروس بالترتيب (عبر كل الوحدات)
  flat = computed<FlatLesson[]>(() =>
    this.units().flatMap((u, ui) =>
      u.lessons.map((lesson, li) => ({ key: this.lessonKey(ui, li, lesson), ui, li, lesson }))
    )
  );

  // حالة كل درس: مفتوح / مقفول بالترتيب / اتخلّص ...
  states = computed(() => {
    const result = new Map<string, LessonState>();
    const prog = this.progress();
    const loggedIn = !!this.auth.currentUser();
    const isAdmin = this.auth.isAdmin();
    const canAccessLocked = this.canAccessLocked();
    let prevDone = true; // الدرس الأول دايمًا متاح
    for (const item of this.flat()) {
      if (item.lesson.locked && !canAccessLocked) {
        result.set(item.key, 'sublocked'); // للمشتركين (مش بيكسر السلسلة)
        continue;
      }
      const done = !!prog[item.key]?.passed;
      let st: LessonState;
      if (done) st = 'passed';
      else if (isAdmin || prevDone) st = loggedIn || isAdmin || item.key === this.firstKey() ? 'open' : 'needlogin';
      else st = loggedIn ? 'seqlocked' : 'needlogin';
      result.set(item.key, st);
      prevDone = done;
    }
    return result;
  });

  private firstKey = computed(() => this.flat().find(f => !f.lesson.locked)?.key ?? '');

  // شريط التقدم
  trackable = computed(() => this.flat().filter(f => !f.lesson.locked || this.canAccessLocked()).length);
  doneCount = computed(() =>
    this.flat().filter(f => (!f.lesson.locked || this.canAccessLocked()) && this.progress()[f.key]?.passed).length
  );
  progressPct = computed(() => {
    const t = this.trackable();
    return t ? Math.round((this.doneCount() / t) * 100) : 0;
  });

  // الدرس الشغال حاليًا (الكائن الكامل)
  currentFlat = computed(() => {
    const cur = this.currentLesson();
    return cur ? this.flat().find(f => f.key === cur.id) ?? null : null;
  });
  currentQuiz = computed<QuizQuestion[]>(() => this.currentFlat()?.lesson.quiz ?? []);
  currentProgress = computed<LessonProgress | null>(() => {
    const cur = this.currentLesson();
    return cur ? this.progress()[cur.id] ?? null : null;
  });
  // الامتحان بيظهر بعد المشاهدة الكاملة بس
  showQuiz = computed(() => {
    const p = this.currentProgress();
    return !!p?.watched && this.currentQuiz().length > 0 && (!p.passed || this.retaking());
  });
  showPassed = computed(() => {
    const p = this.currentProgress();
    return !!p?.passed && !this.retaking() && !!this.currentLesson();
  });
  nextFlat = computed(() => {
    const cur = this.currentLesson();
    if (!cur) return null;
    const list = this.flat();
    const i = list.findIndex(f => f.key === cur.id);
    for (let j = i + 1; j < list.length; j++) {
      if (!list[j].lesson.locked || this.canAccessLocked()) return list[j];
    }
    return null;
  });

  ratingCount = computed(() => this.ratings().length);
  ratingAvg = computed(() => {
    const list = this.ratings();
    if (!list.length) return 0;
    return Math.round((list.reduce((s, r) => s + r.stars, 0) / list.length) * 10) / 10;
  });
  lessonStats = computed(() => {
    const m = new Map<string, { sum: number; count: number; avg: number }>();
    for (const r of this.ratings()) {
      const s = m.get(r.lessonId) ?? { sum: 0, count: 0, avg: 0 };
      s.sum += r.stars;
      s.count++;
      s.avg = Math.round((s.sum / s.count) * 10) / 10;
      m.set(r.lessonId, s);
    }
    return m;
  });
  myRatings = computed(() => {
    const uid = this.auth.currentUser()?.uid;
    const m = new Map<string, number>();
    if (uid) for (const r of this.ratings()) if (r.uid === uid) m.set(r.lessonId, r.stars);
    return m;
  });

  private loadedId = '';
  private toastTimer: any = null;
  private pollTimer: any = null;
  private ytPlayer: any = null;
  private ytToken = 0;
  private tracker = new WatchTracker();

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      clearTimeout(this.toastTimer);
      this.stopPolling();
      this.destroyYt();
    });

    // ---- بيانات الكورس ----
    this.route.paramMap
      .pipe(
        map(p => p.get('id')),
        tap(() => this.state.set('loading')),
        switchMap(id =>
          id
            ? this.coursesService.getCourse(id).pipe(
                map(c => ({ id, c, error: false })),
                catchError(err => { console.error(err); return of({ id, c: undefined, error: true }); })
              )
            : of({ id: '', c: undefined, error: false })
        ),
        takeUntilDestroyed()
      )
      .subscribe(({ id, c, error }) => {
        if (error || !c || !c.title) { this.state.set('notfound'); return; }
        if (!c.isOpen) { this.state.set('closed'); return; }

        const date = c.createdAt?.toDate ? c.createdAt.toDate() : null;
        this.course.set({
          id,
          title: c.title,
          tag: c.tag,
          shortDesc: c.desc,
          fullDesc: c.fullDesc || c.desc,
          outcomes: c.outcomes ?? [],
          includes: c.includes ?? [],
          price: c.price,
          addedAt: date ? date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' }) : '',
          instructorName: c.instructorName?.trim() || SITE.teacherName,
          instructorRole: c.instructorRole?.trim() || SITE.teacherRole
        });
        this.units.set(c.units ?? []);

        // أول تحميل بس بنختار الفيديو (عشان تحديثات الأدمن متقطعش الفيديو اللي شغال)
        if (this.loadedId !== id) {
          this.loadedId = id;
          this.expandedUnit = 0;
          this.currentLesson.set(null);
          if (!(c.videoUrl && this.play(c.videoUrl, 'معاينة الكورس', null))) {
            const first = this.flat().find(f => !f.lesson.locked && f.lesson.videoUrl);
            if (first) this.play(first.lesson.videoUrl, first.lesson.title, first.key);
          }
        }
        this.state.set('ready');
      });

    // ---- تقدم الطالب في الكورس ----
    combineLatest([
      this.route.paramMap.pipe(map(p => p.get('id')), distinctUntilChanged()),
      this.auth.currentUser$.pipe(map(u => u?.uid ?? null), distinctUntilChanged())
    ])
      .pipe(
        switchMap(([id, uid]) =>
          id && uid
            ? this.progressService.getCourseProgress(uid, id).pipe(catchError(() => of({} as Record<string, LessonProgress>)))
            : of({} as Record<string, LessonProgress>)
        ),
        takeUntilDestroyed()
      )
      .subscribe(p => this.progress.set(p));

    // ---- اشتراك الطالب في الكورس ----
    combineLatest([
      this.route.paramMap.pipe(map(p => p.get('id')), distinctUntilChanged()),
      this.auth.currentUser$.pipe(map(u => u?.uid ?? null), distinctUntilChanged())
    ])
      .pipe(
        switchMap(([id, uid]) =>
          id && uid
            ? this.enrollmentsService.isEnrolled(uid, id).pipe(catchError(() => of(false)))
            : of(false)
        ),
        takeUntilDestroyed()
      )
      .subscribe(v => this.enrolled.set(v));

    // ---- تقييمات الكورس ----
    this.route.paramMap
      .pipe(
        map(p => p.get('id')),
        distinctUntilChanged(),
        switchMap(id =>
          id ? this.ratingsService.getRatings(id).pipe(catchError(() => of([] as Rating[]))) : of([] as Rating[])
        ),
        takeUntilDestroyed()
      )
      .subscribe(list => this.ratings.set(list));
  }

  get totalLessons(): number {
    return this.units().reduce((sum, unit) => sum + unit.lessons.length, 0);
  }

  setTab(tab: 'description' | 'content' | 'reviews'): void {
    this.activeTab = tab;
  }

  toggleUnit(index: number): void {
    this.expandedUnit = this.expandedUnit === index ? null : index;
  }

  stars(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  lessonKey(ui: number, li: number, lesson: Lesson): string {
    return lesson.id || `u${ui}l${li}`;
  }

  stateOf(key: string): LessonState {
    return this.states().get(key) ?? 'open';
  }

  toggleFav(): void {
    this.fav.toggle(this.course().id);
  }

  // ---------------- الاشتراك ----------------
  async enroll(): Promise<void> {
    const u = this.auth.currentUser();
    const c = this.course();
    if (!u) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.enrolled() || this.enrolling() || !c.id) return;

    this.enrollMsg.set('');
    this.enrolling.set(true);
    try {
      // TODO(الدفع): لما نربط بوابة دفع، الخطوة دي بتتنقل لسيرفر بعد تأكيد الدفع
      await this.enrollmentsService.enroll(u.uid, c.id, c.title, c.price);
      this.enrolled.set(true);
      this.lockedMsg.set('');
    } catch (err) {
      console.error('enroll failed', err);
      this.enrollMsg.set('معرفتش أكمّل الاشتراك، جرّب تاني');
    } finally {
      this.enrolling.set(false);
    }
  }

  // ---------------- فتح الدروس ----------------
  openLesson(item: FlatLesson): void {
    const st = this.stateOf(item.key);
    if (st === 'sublocked') { this.lockedMsg.set('الحصة دي للمشتركين في الكورس بس، دوس "اشترك في الكورس" 🔒'); return; }
    if (st === 'seqlocked') { this.lockedMsg.set('خلّصي الدرس اللي قبله وانجحي في امتحانه الأول 🔒'); return; }
    if (st === 'needlogin') { this.lockedMsg.set('سجّلي دخول الأول عشان تتابعي الدروس وتتسجل درجاتك 🔒'); return; }
    this.lockedMsg.set('');
    if (this.play(item.lesson.videoUrl, item.lesson.title, item.key)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  openAt(ui: number, li: number, lesson: Lesson): void {
    this.openLesson({ key: this.lessonKey(ui, li, lesson), ui, li, lesson });
  }

  openNext(): void {
    const n = this.nextFlat();
    if (n) this.openLesson(n);
  }

  private play(url: string, title: string, lessonId: string | null): boolean {
    const info = toEmbed(url);
    if (!info) return false;

    this.stopPolling();
    this.destroyYt();
    this.tracker.reset();
    this.watchPct.set(0);
    this.watchMsg.set('');
    this.toast.set(null);
    this.retaking.set(false);
    this.quizResult.set(null);
    this.answers.set([]);
    this.currentLesson.set(lessonId ? { id: lessonId, title } : null);
    this.playingTitle.set(title);

    if (info.kind === 'youtube') {
      this.player.set({ kind: 'youtube', iframeSrc: null, videoSrc: null });
      this.mountYouTube(info.youtubeId!, info.url);
    } else if (info.kind === 'iframe') {
      this.player.set({ kind: 'iframe', iframeSrc: this.sanitizer.bypassSecurityTrustResourceUrl(info.url), videoSrc: null });
    } else {
      this.player.set({ kind: 'video', iframeSrc: null, videoSrc: info.url });
    }
    return true;
  }

  // ---------------- يوتيوب + تتبع المشاهدة ----------------
  private mountYouTube(videoId: string, fallbackUrl: string): void {
    const token = ++this.ytToken;
    const attempt = (n: number) => {
      if (token !== this.ytToken) return;
      const host = document.getElementById('yt-wrap');
      if (!host) {
        if (n < 40) setTimeout(() => attempt(n + 1), 50);
        return;
      }
      host.innerHTML = '<div id="yt-target"></div>';
      loadYouTubeApi()
        .then(YT => {
          if (token !== this.ytToken) return;
          this.ytPlayer = new YT.Player('yt-target', {
            videoId,
            host: 'https://www.youtube-nocookie.com',
            playerVars: { rel: 0, modestbranding: 1 },
            events: {
              onStateChange: (e: any) => this.onYtState(e.data)
            }
          });
        })
        .catch(() => {
          if (token !== this.ytToken) return;
          this.player.set({ kind: 'iframe', iframeSrc: this.sanitizer.bypassSecurityTrustResourceUrl(fallbackUrl), videoSrc: null });
        });
    };
    attempt(0);
  }

  private onYtState(state: number): void {
    // 1 شغال، 2 وقفة، 3 تحميل/تقديم، 0 خلص
    if (state === 1) {
      try { this.tracker.duration = this.ytPlayer.getDuration() || this.tracker.duration; } catch { /* ignore */ }
      this.startPolling();
    } else if (state === 2 || state === 3) {
      this.stopPolling();
      this.tracker.breakChain();
    } else if (state === 0) {
      this.stopPolling();
      try { this.tracker.tick(this.ytPlayer.getCurrentTime()); } catch { /* ignore */ }
      this.updatePct();
      this.onVideoEnded();
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      try {
        this.tracker.tick(this.ytPlayer.getCurrentTime());
        this.updatePct();
      } catch { /* ignore */ }
    }, 1000);
  }

  private stopPolling(): void {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private destroyYt(): void {
    this.ytToken++;
    try { this.ytPlayer?.destroy(); } catch { /* ignore */ }
    this.ytPlayer = null;
  }

  private updatePct(): void {
    this.watchPct.set(Math.round(this.tracker.ratio * 100));
  }

  // ---------------- ملف mp4 مباشر ----------------
  onVideoMeta(ev: Event): void {
    this.tracker.duration = (ev.target as HTMLVideoElement).duration || 0;
  }
  onVideoTime(ev: Event): void {
    this.tracker.tick((ev.target as HTMLVideoElement).currentTime);
    this.updatePct();
  }
  onVideoBreak(): void {
    this.tracker.breakChain();
  }

  // ---------------- خلّص المشاهدة ----------------
  /** الفيديو وصل للنهاية (يوتيوب / mp4) */
  onVideoEnded(): void {
    const cur = this.currentLesson();
    if (!cur) return;
    if (!this.auth.currentUser()) {
      this.showToast({ kind: 'login' }, 8000);
      return;
    }
    if (this.tracker.ratio < WATCH_THRESHOLD) {
      this.watchMsg.set(
        `شوفتي ${Math.round(this.tracker.ratio * 100)}% بس من الدرس. شوفيه كامل من غير تقديم عشان الامتحان يتفتح`
      );
      return;
    }
    this.completeWatch();
  }

  /** فيميو / درايف: مفيش طريقة نتأكد، فالطالب بيأكد بنفسه */
  confirmWatched(): void {
    if (!this.currentLesson()) return;
    if (!this.auth.currentUser()) {
      this.showToast({ kind: 'login' }, 8000);
      return;
    }
    this.completeWatch();
  }

  private async completeWatch(): Promise<void> {
    const cur = this.currentLesson();
    const u = this.auth.currentUser();
    if (!cur || !u) return;
    this.watchMsg.set('');

    const old = this.progress()[cur.id] ?? {};
    const hasQuiz = this.currentQuiz().length > 0;
    const next: LessonProgress = hasQuiz
      ? { ...old, watched: true }
      : { ...old, watched: true, passed: true };

    this.progress.update(p => ({ ...p, [cur.id]: next }));
    await this.persist(cur.id, next);

    // مفيش امتحان = الدرس خلص، نعرض التقييم
    if (!hasQuiz) this.promptRating(false);
  }

  // ---------------- الامتحان ----------------
  pick(qi: number, oi: number): void {
    if (this.quizResult()?.passed) return;
    this.answers.update(a => {
      const copy = [...a];
      copy[qi] = oi;
      return copy;
    });
    if (this.quizResult()) this.quizResult.set(null); // غيّرت إجابة بعد نتيجة فاشلة
  }

  get allAnswered(): boolean {
    const qs = this.currentQuiz();
    const a = this.answers();
    return qs.length > 0 && qs.every((_, i) => a[i] !== undefined);
  }

  async submitQuiz(): Promise<void> {
    const cur = this.currentLesson();
    const u = this.auth.currentUser();
    const qs = this.currentQuiz();
    if (!cur || !u || !this.allAnswered || this.savingQuiz()) return;

    const wrong: number[] = [];
    qs.forEach((q, i) => { if (this.answers()[i] !== q.answer) wrong.push(i); });
    const score = Math.round(((qs.length - wrong.length) / qs.length) * 100);
    const passed = score >= PASS_PERCENT;
    this.quizResult.set({ score, passed, wrong });

    const old = this.progress()[cur.id] ?? {};
    const next: LessonProgress = {
      ...old,
      watched: true,
      passed: old.passed || passed,
      lastScore: score,
      bestScore: Math.max(old.bestScore ?? 0, score),
      attempts: (old.attempts ?? 0) + 1
    };
    this.savingQuiz.set(true);
    this.progress.update(p => ({ ...p, [cur.id]: next }));
    await this.persist(cur.id, next);
    this.savingQuiz.set(false);

    if (passed) {
      this.retaking.set(false);
      this.promptRating(false);
    }
  }

  retryQuiz(): void {
    this.answers.set([]);
    this.quizResult.set(null);
  }

  startRetake(): void {
    this.answers.set([]);
    this.quizResult.set(null);
    this.retaking.set(true);
  }

  private async persist(lessonId: string, data: LessonProgress): Promise<void> {
    const u = this.auth.currentUser();
    if (!u) return;
    try {
      await this.progressService.saveLesson(
        u.uid, this.course().id, this.course().title, lessonId, data,
        this.auth.displayName() || 'طالب'
      );
        } catch (err) {
      console.error('progress save failed', err);
      this.showToast({ kind: 'error' }, 4000);
    }
  }

  // ---------------- التقييم ----------------
  /** manual = الطالب داس زرار "قيّم الدرس" */
  promptRating(manual = false): void {
    const lesson = this.currentLesson();
    if (!lesson) return;

    const u = this.auth.currentUser();
    if (!u) {
      this.showToast({ kind: 'login' }, 7000);
      return;
    }
    const already = this.myRatings().get(lesson.id);
    if (already && !manual) return;
    this.setTab('reviews');
    this.hover.set(0);
    this.showToast({ kind: 'rate', lessonId: lesson.id, lessonTitle: lesson.title, stars: already ?? 0 }, 12000);
  }

  async submitRating(stars: number): Promise<void> {
    const t = this.toast();
    const u = this.auth.currentUser();
    if (!t || t.kind !== 'rate' || !u || !t.lessonId) return;

    this.showToast({ ...t, kind: 'thanks', stars }, 2200);
    try {
      await this.ratingsService.rate(this.course().id, {
        lessonId: t.lessonId,
        lessonTitle: t.lessonTitle ?? '',
        uid: u.uid,
        userName: this.auth.displayName() || 'طالب',
        stars
      });
    } catch (err) {
      console.error('rating failed', err);
      this.showToast({ kind: 'error' }, 4000);
    }
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
  }

  goLogin(): void {
    this.dismissToast();
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  private showToast(t: Toast, ms: number): void {
    clearTimeout(this.toastTimer);
    this.toast.set(t);
    this.toastTimer = setTimeout(() => this.toast.set(null), ms);
  }
}