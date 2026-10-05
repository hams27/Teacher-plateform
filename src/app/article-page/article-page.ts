import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { Article, ArticlesService } from '../articles';
import { SiteNav } from '../site-nav/site-nav';

@Component({
  selector: 'app-article-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteNav],
  templateUrl: './article-page.html',
  styleUrl: './article-page.scss'
})
export class ArticlePage {
  article = signal<Article | null>(null);
  state = signal<'loading' | 'ready' | 'notfound'>('loading');

  constructor() {
    const route = inject(ActivatedRoute);
    const service = inject(ArticlesService);

    route.paramMap
      .pipe(
        map(p => p.get('id')),
        tap(() => this.state.set('loading')),
        switchMap(id =>
          id ? service.getArticle(id).pipe(catchError(() => of(undefined))) : of(undefined)
        ),
        takeUntilDestroyed()
      )
      .subscribe(a => {
        // المقالة المخفية متتعرضش للطلاب
        if (!a || !a.title || !a.isPublished) { this.state.set('notfound'); return; }
        this.article.set(a);
        this.state.set('ready');
      });
  }

  get date(): string {
    const d = this.article()?.createdAt?.toDate ? this.article()!.createdAt.toDate() : null;
    return d ? d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  }
}
