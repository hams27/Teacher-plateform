import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Article, ArticlesService } from '../articles';
import { SiteNav } from '../site-nav/site-nav';

@Component({
  selector: 'app-articles-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteNav],
  templateUrl: './articles-page.html',
  styleUrl: './articles-page.scss'
})
export class ArticlesPage {
  articles = signal<Article[]>([]);
  loading = signal(true);
  activeCategory = signal('all');

  // التصنيفات المتاحة (من المقالات المنشورة نفسها)
  categories = computed(() => {
    const set = new Set(this.articles().map(a => (a.category || '').trim()).filter(Boolean));
    return [...set];
  });

  // لو التصنيف المختار اتشال (مقالة اتخفت مثلاً) نرجع لـ "الكل"
  current = computed(() => {
    const c = this.activeCategory();
    return c === 'all' || this.categories().includes(c) ? c : 'all';
  });

  filtered = computed(() => {
    const c = this.current();
    return c === 'all' ? this.articles() : this.articles().filter(a => (a.category || '').trim() === c);
  });

  constructor() {
    inject(ArticlesService).getPublished().subscribe({
      next: list => { this.articles.set(list); this.loading.set(false); },
      error: err => { console.error(err); this.loading.set(false); }
    });
  }

  setCategory(c: string) { this.activeCategory.set(c); }

  trackById(_: number, a: Article) { return a.id; }

  dateOf(a: Article): string {
    const d = a.createdAt?.toDate ? a.createdAt.toDate() : null;
    return d ? d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  }

  // مقتطف قصير من أول المقالة
  excerpt(a: Article): string {
    const t = (a.body || '').replace(/\s+/g, ' ').trim();
    return t.length > 140 ? t.slice(0, 140).trimEnd() + '…' : t;
  }

  // وقت القراءة التقريبي (حوالي 180 كلمة في الدقيقة)
  readTime(a: Article): string {
    const words = (a.body || '').trim().split(/\s+/).filter(Boolean).length;
    const m = Math.max(1, Math.ceil(words / 180));
    if (m === 1) return 'دقيقة قراءة';
    if (m === 2) return 'دقيقتين قراءة';
    if (m <= 10) return `${m} دقائق قراءة`;
    return `${m} دقيقة قراءة`;
  }
}