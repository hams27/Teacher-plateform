import { AfterViewInit, Component, DestroyRef, ElementRef, NgZone, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SiteNav } from '../site-nav/site-nav';
import { CourseCard } from '../course-card/course-card';
import { CoursesService, Course } from '../courses';

@Component({
  selector: 'app-courses',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SiteNav, CourseCard],
  templateUrl: './courses.html',
  styleUrl: './courses.scss'
})
export class Courses implements AfterViewInit {

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  activeFilter: 'all' | 'history' | 'geography' | 'review' = 'all';
  searchTerm: string = '';

  courses = signal<Course[]>([]);
  loading = signal(true);

  constructor(private coursesService: CoursesService) {
    this.coursesService.getCourses().subscribe({
      next: data => {
        // نعرض للطلاب بس الكورسات المفتوحة (isOpen = true)
        this.courses.set(data.filter(course => course.isOpen));
        this.loading.set(false);
      },
      error: err => { console.error(err); this.loading.set(false); }
    });
  }

  // ---- ترقيم الصفحات ----
  readonly pageSize = 9;
  currentPage = 1;

  setFilter(subject: 'all' | 'history' | 'geography' | 'review'): void {
    this.activeFilter = subject;
    this.currentPage = 1;
  }

  onSearchChange(value: string): void {
    this.searchTerm = value;
    this.currentPage = 1;
  }

  get filteredCourses(): Course[] {
    return this.courses().filter(course => {
      const matchesFilter = this.activeFilter === 'all' || course.subject === this.activeFilter;
      const matchesSearch = course.title.toLowerCase().includes(this.searchTerm.trim().toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredCourses.length / this.pageSize));
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get pagedCourses(): Course[] {
    const page = Math.min(this.currentPage, this.totalPages);
    const start = (page - 1) * this.pageSize;
    return this.filteredCourses.slice(start, start + this.pageSize);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- أنيميشن التصميم (إضاءة الكارت مع الماوس + وهج الهيدر) ----
  ngAfterViewInit(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = this.host.nativeElement;
    const onMove = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      const spot = t.closest?.('.spot') as HTMLElement | null;
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
        spot.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      }
      const hero = root.querySelector('.page-hero') as HTMLElement | null;
      if (hero) {
        const r = hero.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          root.style.setProperty('--hx', ((ev.clientX - r.left) / r.width * 100) + '%');
          root.style.setProperty('--hy', ((ev.clientY - r.top) / r.height * 100) + '%');
        }
      }
    };
    this.zone.runOutsideAngular(() => root.addEventListener('pointermove', onMove));
    this.destroyRef.onDestroy(() => root.removeEventListener('pointermove', onMove));
  }
}