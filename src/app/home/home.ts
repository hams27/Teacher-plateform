import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Course, CoursesService } from '../courses';
import { Article, ArticlesService } from '../articles';
import { Testimonial, TestimonialsService, TESTIMONIAL_MAX } from '../testimonials';
import { AuthService } from '../auth';
import { CourseCard } from '../course-card/course-card';
import { NavUser } from '../nav-user/nav-user';
import { SITE } from '../site-config';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule, RouterLink, CourseCard, NavUser],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements AfterViewInit {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);
  private auth = inject(AuthService);
  private router = inject(Router);
  private testimonialsService = inject(TestimonialsService);

  // الأرقام وروابط التواصل من site-config.ts
  readonly site = SITE;

  /** الرابط الحقيقي يتفتح في تاب جديد، أما '#' الوهمي فميفتحش حاجة */
  isExternal(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  // آخر 6 كورسات مفتوحة
  courses = signal<Course[]>([]);
  loading = signal(true);

  // آخر 3 مقالات منشورة
  articles = signal<Article[]>([]);

  // آخر 3 آراء
  testimonials = signal<Testimonial[]>([]);
  showOpinionForm = signal(false);
  opinionText = '';
  opinionSaving = signal(false);
  opinionMsg = signal('');
  opinionError = signal(false);
  readonly maxLen = TESTIMONIAL_MAX;

  constructor(coursesService: CoursesService, articlesService: ArticlesService) {
    coursesService.getCourses().subscribe({
      next: data => {
        this.courses.set(data.filter(c => c.isOpen).slice(0, 6));
        this.loading.set(false);
      },
      error: err => { console.error(err); this.loading.set(false); }
    });

    articlesService.getPublished().subscribe({
      next: list => this.articles.set(list.slice(0, 3)),
      error: err => console.error(err)
    });

    this.testimonialsService.getLatest(3).subscribe({
      next: list => this.testimonials.set(list),
      error: err => console.error(err)
    });
  }

  dateOf(a: Article): string {
    const d = a.createdAt?.toDate ? a.createdAt.toDate() : null;
    return d ? d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  }

  // ---------- إضافة رأي ----------
  openOpinion(): void {
    this.opinionMsg.set('');
    if (!this.auth.currentUser()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/' } });
      return;
    }
    this.showOpinionForm.set(true);
  }

  closeOpinion(): void {
    this.showOpinionForm.set(false);
  }

  async sendOpinion(): Promise<void> {
    const u = this.auth.currentUser();
    const text = this.opinionText.trim();
    if (!u) return;
    if (!text) {
      this.opinionError.set(true);
      this.opinionMsg.set('اكتب رأيك الأول');
      return;
    }
    this.opinionSaving.set(true);
    this.opinionMsg.set('');
    try {
      await this.testimonialsService.save(u.uid, this.auth.displayName() || 'طالب', text);
      this.opinionText = '';
      this.showOpinionForm.set(false);
      this.opinionError.set(false);
      this.opinionMsg.set('شكرًا على رأيك! ظهر في القسم ده ✓');
    } catch (err) {
      console.error(err);
      this.opinionError.set(true);
      this.opinionMsg.set('معرفتش أحفظ رأيك، جرّب تاني');
    } finally {
      this.opinionSaving.set(false);
    }
  }

  // =====================================================================
  //  الأنيميشن (تصميم فقط — مفيش أي تأثير على المنطق اللي فوق)
  // =====================================================================
  toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.zone.runOutsideAngular(() => this.initMotion());
  }

  private initMotion(): void {
    const root = this.host.nativeElement;
    root.classList.add('anim');
    const cleanups: Array<() => void> = [];

    // 1) ظهور العناصر عند السكرول + عدّاد الأرقام
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    const counters = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this.countUp(e.target as HTMLElement);
        counters.unobserve(e.target);
      }
    }, { threshold: 0.6 });

    const scan = () => {
      root.querySelectorAll('.rv').forEach(el => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
      root.querySelectorAll('.num').forEach(el => { if (!seen.has(el)) { seen.add(el); counters.observe(el); } });
    };
    scan();
    // الكورسات والمقالات بتيجي من الشبكة بعد ما الصفحة تفتح
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    cleanups.push(() => { io.disconnect(); counters.disconnect(); mo.disconnect(); });

    // 2) السكرول: شريط التقدم + ظل الهيدر + زر الأعلى
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const y = window.scrollY;
        root.style.setProperty('--sp', String(max > 0 ? Math.min(1, y / max) : 0));
        root.classList.toggle('scrolled', y > 20);
        root.classList.toggle('show-top', y > 700);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    cleanups.push(() => window.removeEventListener('scroll', onScroll));

    // 3) الماوس: وهج الهيرو + باراليكس + إضاءة الكروت + ميل 3D خفيف
    const onMove = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      const hero = root.querySelector('.hero') as HTMLElement | null;
      if (hero) {
        const r = hero.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
          root.style.setProperty('--hx', (x * 100) + '%');
          root.style.setProperty('--hy', (y * 100) + '%');
          root.style.setProperty('--px', String((x - 0.5) * 2));
          root.style.setProperty('--py', String((y - 0.5) * 2));
        }
      }
      const spot = t.closest?.('.spot') as HTMLElement | null;
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
        spot.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      }
      const tilt = t.closest?.('.tilt') as HTMLElement | null;
      if (tilt && ev.pointerType === 'mouse') {
        const r = tilt.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg');
        tilt.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
      }
    };
    const onLeave = (ev: Event) => {
      const tilt = (ev.target as HTMLElement).closest?.('.tilt') as HTMLElement | null;
      if (tilt && !tilt.contains((ev as PointerEvent).relatedTarget as Node)) {
        tilt.style.setProperty('--rx', '0deg');
        tilt.style.setProperty('--ry', '0deg');
      }
    };
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerout', onLeave);
    cleanups.push(() => { root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerout', onLeave); });

    // 4) سكرول ناعم للروابط الداخلية (#about, #courses ...)
    const onClick = (ev: Event) => {
      const a = (ev.target as HTMLElement).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      const id = a?.getAttribute('href')?.slice(1);
      const target = id ? root.querySelector('#' + id) : null;
      if (target) {
        ev.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    root.addEventListener('click', onClick);
    cleanups.push(() => root.removeEventListener('click', onClick));

    this.destroyRef.onDestroy(() => cleanups.forEach(fn => fn()));
  }

  /** بيعدّ من صفر للرقم الحقيقي (بيحافظ على + والفواصل) */
  private countUp(el: HTMLElement): void {
    const original = (el.textContent || '').trim();
    const m = original.match(/^(\D*)([\d,\.]+)(\D*)$/);
    if (!m) return;
    const target = parseFloat(m[2].replace(/,/g, ''));
    if (!isFinite(target)) return;
    const withComma = m[2].includes(',');
    const start = performance.now(), dur = 1800;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(2, -10 * p);
      const v = Math.round(target * eased);
      el.textContent = m[1] + (withComma ? v.toLocaleString('en-US') : String(v)) + m[3];
      if (p < 1) requestAnimationFrame(step); else el.textContent = original;
    };
    requestAnimationFrame(step);
  }
}