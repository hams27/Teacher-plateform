import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Courses } from './courses/courses';
import { CourseDetail } from './course-detail/course-detail';
import { AdminLogin } from './admin-login/admin-login';
import { Admin } from './admin/admin';
import { StudentAuth } from './student-auth/student-auth';
import { FavoritesPage } from './favorites-page/favorites-page';
import { ArticlesPage } from './articles-page/articles-page';
import { ArticlePage } from './article-page/article-page';
import { ProgressPage } from './progress-page/progress-page';
import { authGuard, studentGuard } from './auth-guard';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'courses', component: Courses },
  { path: 'courses/:id', component: CourseDetail },
  { path: 'articles', component: ArticlesPage },
  { path: 'articles/:id', component: ArticlePage },
  { path: 'login', component: StudentAuth, data: { mode: 'login' } },
  { path: 'register', component: StudentAuth, data: { mode: 'register' } },
  { path: 'favorites', component: FavoritesPage, canActivate: [studentGuard] },
  { path: 'progress', component: ProgressPage, canActivate: [studentGuard] },
  { path: 'admin/login', component: AdminLogin },
  { path: 'admin', component: Admin, canActivate: [authGuard] }
];
