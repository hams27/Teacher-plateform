import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Course, CoursesService } from '../courses';
import { FavoritesService } from '../favorites';
import { SiteNav } from '../site-nav/site-nav';
import { CourseCard } from '../course-card/course-card';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SiteNav, CourseCard],
  templateUrl: './favorites-page.html',
  styleUrl: './favorites-page.scss'
})
export class FavoritesPage {
  private fav = inject(FavoritesService);

  all = signal<Course[]>([]);
  loading = signal(true);

  // الكورسات المفتوحة اللي الطالب ضافها لمفضلته
  list = computed(() => this.all().filter(c => c.isOpen && !!c.id && this.fav.ids().has(c.id)));

  constructor(coursesService: CoursesService) {
    coursesService.getCourses().subscribe({
      next: data => { this.all.set(data); this.loading.set(false); },
      error: err => { console.error(err); this.loading.set(false); }
    });
  }
}
