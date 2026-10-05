import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Course } from '../courses';
import { FavoritesService } from '../favorites';

@Component({
  selector: 'app-course-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './course-card.html',
  styleUrl: './course-card.scss'
})
export class CourseCard {
  course = input.required<Course>();
  fav = inject(FavoritesService);

  toggleFav(): void {
    this.fav.toggle(this.course().id);
  }
}
