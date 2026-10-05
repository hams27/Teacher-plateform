import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth';
import { CoursesService, Course, Unit, Lesson } from '../courses';
import { toEmbed } from '../video-utils';
import { ArticlesService, Article } from '../articles';
import { TestimonialsService, Testimonial } from '../testimonials';
import { ProgressService, StudentCourseProgress, PASS_PERCENT } from '../progress';
import { EnrollmentsService, Enrollment } from '../enrollments';

interface StudentLessonRow { title: string; status: 'passed' | 'waiting' | 'new'; score: number | null; attempts: number; }
interface StudentCourseRow { courseId: string; title: string; done: number; total: number; pct: number; avg: number | null; lessons: StudentLessonRow[]; }
interface StudentRow {
  uid: string; name: string; courses: StudentCourseRow[];
  done: number; total: number; pct: number; avg: number | null; last: Date | null;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class Admin {
  // المشروع zoneless، فأي حاجة بتتغير بعد استدعاء async لازم تكون signal
  activeTab = signal<'courses' | 'articles' | 'testimonials' | 'progress'>('courses');

  courses = signal<Course[]>([]);
  articles = signal<Article[]>([]);
  testimonials = signal<Testimonial[]>([]);
  loading = signal(true);
  errorMsg = signal('');
  saving = signal(false);

  showCourseForm = signal(false);
  editingCourseId: string | null = null;
  courseForm: Course = this.emptyCourse();
  outcomesText = '';
  includesText = '';

  showArticleForm = signal(false);
  editingArticleId: string | null = null;
  articleForm: Article = this.emptyArticle();

  constructor(
    private coursesService: CoursesService,
    private articlesService: ArticlesService,
    private testimonialsService: TestimonialsService,
    private authService: AuthService,
    private router: Router,
    private progressService: ProgressService,
    private enrollmentsService: EnrollmentsService
    
  ) {
    this.coursesService.getCourses().subscribe({
      next: data => { this.courses.set(data); this.loading.set(false); },
      error: err => this.fail('مش قادر أحمّل الكورسات', err)
    });
    this.articlesService.getArticles().subscribe({
      next: data => this.articles.set(data),
      error: err => this.fail('مش قادر أحمّل المقالات', err)
    });
    this.testimonialsService.getAll().subscribe({
      next: data => this.testimonials.set(data),
      error: err => this.fail('مش قادر أحمّل الآراء', err)
    });
        this.progressService.getAllStudents().subscribe({
      next: d => { this.progressDocs.set(d); this.progressLoading.set(false); },
      error: err => { this.fail('مش قادر أحمّل تقدم الطلاب', err); this.progressLoading.set(false); }
    });
    this.enrollmentsService.getAll().subscribe({
      next: e => this.enrollments.set(e),
      error: err => console.error(err)
    });
  }

  setTab(tab: 'courses' | 'articles' | 'testimonials' | 'progress'): void {
        this.activeTab.set(tab);
  }

  private fail(msg: string, err: any): void {
    console.error(msg, err);
    const code = err?.code ? ` (${err.code})` : '';
    this.errorMsg.set(msg + code);
    this.loading.set(false);
    this.saving.set(false);
  }

  // ============ كورسات ============
  emptyCourse(): Course {
    return {
      title: '', tag: '', desc: '', price: 0, subject: 'history', isOpen: true,
      videoUrl: '', fullDesc: '', outcomes: [], includes: [], units: []
    };
  }

  openAddCourse(): void {
    this.courseForm = this.emptyCourse();
    this.outcomesText = '';
    this.includesText = '';
    this.editingCourseId = null;
    this.showCourseForm.set(true);
  }

  openEditCourse(course: Course): void {
    // نسخة عميقة عشان تعديل الوحدات ميأثرش على الجدول قبل الحفظ
    this.courseForm = { ...this.emptyCourse(), ...JSON.parse(JSON.stringify(course)) };
    this.outcomesText = (this.courseForm.outcomes ?? []).join('\n');
    this.includesText = (this.courseForm.includes ?? []).join('\n');
    this.editingCourseId = course.id ?? null;
    this.showCourseForm.set(true);
  }

  closeCourseForm(): void {
    this.showCourseForm.set(false);
  }

  // ---- الوحدات والحصص ----
  addUnit(): void {
    (this.courseForm.units ??= []).push({ title: '', lessons: [] });
  }

  removeUnit(i: number): void {
    this.courseForm.units?.splice(i, 1);
  }

  addLesson(unit: Unit): void {
    unit.lessons.push({ title: '', duration: '', videoUrl: '', locked: false, quiz: [] });
  }

  removeLesson(unit: Unit, i: number): void {
    unit.lessons.splice(i, 1);
  }

  // ---- أسئلة الامتحان ----
  addQuestion(lesson: Lesson): void {
    (lesson.quiz ??= []).push({ q: '', options: ['', '', '', ''], answer: 0 });
  }

  removeQuestion(lesson: Lesson, i: number): void {
    lesson.quiz?.splice(i, 1);
  }

  /** بينضّف أسئلة حصة ويرجّع null لو فيه سؤال ناقص */
  private cleanQuiz(lesson: Lesson): Lesson['quiz'] | null {
    const out: NonNullable<Lesson['quiz']> = [];
    for (const q of lesson.quiz ?? []) {
      const opts = q.options.map((o, i) => ({ o: o.trim(), i })).filter(x => x.o);
      const empty = !q.q.trim() && opts.length === 0;
      if (empty) continue; // سؤال فاضي بنشيله
      const answer = opts.findIndex(x => x.i === q.answer);
      if (!q.q.trim() || opts.length < 2 || answer < 0) return null;
      out.push({ q: q.q.trim(), options: opts.map(x => x.o), answer });
    }
    return out;
  }

  trackIndex(i: number): number { return i; }

  isValidVideo(url: string | undefined): boolean {
    return !!toEmbed(url);
  }

  private newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  private lines(text: string): string[] {
    return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }

  async saveCourse(): Promise<void> {
    if (!this.courseForm.title.trim()) return;
    this.errorMsg.set('');
    this.saving.set(true);
    try {
      this.courseForm.price = Number(this.courseForm.price) || 0;
      this.courseForm.outcomes = this.lines(this.outcomesText);
      this.courseForm.includes = this.lines(this.includesText);
      // نشيل الوحدات والحصص الفاضية
      for (const u of this.courseForm.units ?? []) {
        for (const l of u.lessons) {
          const cleaned = this.cleanQuiz(l);
          if (cleaned === null) {
            this.errorMsg.set(`في سؤال ناقص في حصة "${l.title || 'بدون عنوان'}": لازم نص السؤال واختيارين على الأقل وإجابة صحيحة مكتوبة`);
            this.saving.set(false);
            return;
          }
          l.quiz = cleaned;
        }
      }
      this.courseForm.units = (this.courseForm.units ?? [])
        .map(u => ({
          ...u,
          // كل حصة بياخد id ثابت عشان التقييمات تفضل ماسكة فيها حتى لو غيّرنا الترتيب
          lessons: u.lessons.filter(l => l.title.trim()).map(l => ({ ...l, id: l.id || this.newId() }))
        }))
        .filter(u => u.title.trim() || u.lessons.length > 0);
      if (this.editingCourseId) {
        await this.coursesService.updateCourse(this.editingCourseId, this.courseForm);
      } else {
        await this.coursesService.addCourse(this.courseForm);
      }
      this.showCourseForm.set(false);
    } catch (err) {
      this.fail('فشل حفظ الكورس', err);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteCourse(id: string | undefined): Promise<void> {
    if (!id) return;
    if (!confirm('متأكد إنك عايز تحذف الكورس ده؟')) return;
    try {
      await this.coursesService.deleteCourse(id);
    } catch (err) {
      this.fail('فشل حذف الكورس', err);
    }
  }

  async toggleCourseOpen(course: Course): Promise<void> {
    if (!course.id) return;
    try {
      await this.coursesService.toggleOpen(course.id, course.isOpen);
    } catch (err) {
      this.fail('فشل تغيير حالة الكورس', err);
    }
  }

  // ============ مقالات ============
  emptyArticle(): Article {
    return { title: '', category: '', body: '', isPublished: true };
  }

  openAddArticle(): void {
    this.articleForm = this.emptyArticle();
    this.editingArticleId = null;
    this.showArticleForm.set(true);
  }

  openEditArticle(article: Article): void {
    this.articleForm = { ...this.emptyArticle(), ...article };
    this.editingArticleId = article.id ?? null;
    this.showArticleForm.set(true);
  }

  closeArticleForm(): void {
    this.showArticleForm.set(false);
  }

  async saveArticle(): Promise<void> {
    if (!this.articleForm.title.trim()) return;
    this.errorMsg.set('');
    this.saving.set(true);
    try {
      if (this.editingArticleId) {
        await this.articlesService.updateArticle(this.editingArticleId, this.articleForm);
      } else {
        await this.articlesService.addArticle(this.articleForm);
      }
      this.showArticleForm.set(false);
    } catch (err) {
      this.fail('فشل حفظ المقالة', err);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteTestimonial(id: string | undefined): Promise<void> {
    if (!id) return;
    if (!confirm('حذف الرأي ده من الصفحة الرئيسية؟')) return;
    try {
      await this.testimonialsService.remove(id);
    } catch (err) {
      this.fail('فشل حذف الرأي', err);
    }
  }

  dateOf(item: { createdAt?: any }): string {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : null;
    return d ? d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  }

  async deleteArticle(id: string | undefined): Promise<void> {
    if (!id) return;
    if (!confirm('متأكد إنك عايز تحذف المقالة دي؟')) return;
    try {
      await this.articlesService.deleteArticle(id);
    } catch (err) {
      this.fail('فشل حذف المقالة', err);
    }
  }

  async toggleArticlePublish(article: Article): Promise<void> {
    if (!article.id) return;
    try {
      await this.articlesService.togglePublish(article.id, article.isPublished);
    } catch (err) {
      this.fail('فشل تغيير حالة المقالة', err);
    }
  }

  readonly passPercent = PASS_PERCENT;
  progressDocs = signal<StudentCourseProgress[]>([]);
  enrollments = signal<Enrollment[]>([]);
  progressLoading = signal(true);
  studentSearch = signal('');
  courseFilter = signal('all');
  expandedStudent = signal<string | null>(null);

  studentRows = computed<StudentRow[]>(() => {
    const courses = this.courses();
    const enrolled = new Set(this.enrollments().map(e => `${e.uid}_${e.courseId}`));
    const savedNames = new Map<string, string>();
    for (const t of this.testimonials()) if (t.id && t.userName) savedNames.set(t.id, t.userName);

    const filter = this.courseFilter();
    const q = this.studentSearch().trim().toLowerCase();

    const byUid = new Map<string, StudentCourseProgress[]>();
    for (const d of this.progressDocs()) {
      if (!d.uid || (filter !== 'all' && d.courseId !== filter)) continue;
      const list = byUid.get(d.uid) ?? [];
      list.push(d);
      byUid.set(d.uid, list);
    }

    const out: StudentRow[] = [];
    for (const [uid, docs] of byUid) {
      const courseRows: StudentCourseRow[] = [];
      let last: Date | null = null;

      for (const d of docs) {
        const c = courses.find(x => x.id === d.courseId);
        if (!c) continue; // الكورس اتحذف
        const lessons: StudentLessonRow[] = [];
        (c.units ?? []).forEach((u, ui) =>
          u.lessons.forEach((l, li) => {
            // الحصص المقفولة بتتحسب بس لو الطالب مشترك (نفس منطق صفحة الطالب)
            if (l.locked && !enrolled.has(`${uid}_${c.id}`)) return;
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
        courseRows.push({
          courseId: d.courseId,
          title: c.title,
          done,
          total: lessons.length,
          pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
          avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          lessons
        });
        const t: Date | null = d.updatedAt?.toDate ? d.updatedAt.toDate() : null;
        if (t && (!last || t > last)) last = t;
      }
      if (!courseRows.length) continue;

      const name = docs.find(d => d.userName)?.userName || savedNames.get(uid) || `طالب (${uid.slice(0, 5)})`;
      if (q && !name.toLowerCase().includes(q)) continue;

      const done = courseRows.reduce((s, r) => s + r.done, 0);
      const total = courseRows.reduce((s, r) => s + r.total, 0);
      const allScores = courseRows.flatMap(r => r.lessons).filter(l => l.score !== null).map(l => l.score as number);
      out.push({
        uid, name, courses: courseRows, done, total,
        pct: total ? Math.round((done / total) * 100) : 0,
        avg: allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null,
        last
      });
    }
    return out.sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));
  });

  toggleStudent(uid: string): void {
    this.expandedStudent.update(cur => (cur === uid ? null : uid));
  }

  fmtDate(d: Date | null): string {
    return d ? d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  }
  
  // ============ تسجيل الخروج ============
  logout(): void {
    this.authService.logout().then(() => this.router.navigate(['/admin/login']));
  }
  
}