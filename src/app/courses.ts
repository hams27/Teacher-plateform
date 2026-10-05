import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, docData,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number; // رقم الإجابة الصحيحة (يبدأ من 0)
}

export interface Lesson {
  id?: string;
  title: string;
  duration: string;
  videoUrl: string;
  locked: boolean; // true = للمشتركين بس
  quiz?: QuizQuestion[]; // امتحان قصير بعد الدرس (اختياري)
}

export interface Unit {
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id?: string;
  title: string;
  tag: string;
  desc: string;
  price: number;
  subject: 'history' | 'geography' | 'review';
  isOpen: boolean;
  videoUrl?: string;
  fullDesc?: string;
  outcomes?: string[];
  includes?: string[];
  units?: Unit[];
  instructorName?: string; // لو فاضي بيتعرض اسم المدرس الافتراضي من site-config.ts
  instructorRole?: string;
  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private firestore: Firestore = inject(Firestore);
  private injector: Injector = inject(Injector);
  private coursesRef = collection(this.firestore, 'courses');

  // الأحدث الأول (الكورسات اللي لسه بتتحفظ بتبقى createdAt = null فتظهر فوق)
  getCourses(): Observable<Course[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(this.coursesRef, { idField: 'id' }) as Observable<Course[]>).pipe(
        map(list =>
          [...list].sort((a, b) => this.time(b) - this.time(a))
        )
      )
    );
  }

  getCourse(id: string): Observable<Course | undefined> {
    return runInInjectionContext(this.injector, () => {
      const courseDoc = doc(this.firestore, `courses/${id}`);
      return docData(courseDoc, { idField: 'id' }) as Observable<Course | undefined>;
    });
  }

  addCourse(course: Course) {
    const { id, createdAt, ...data } = course;
    return runInInjectionContext(this.injector, () =>
      addDoc(this.coursesRef, { ...this.clean(data), createdAt: serverTimestamp() })
    );
  }

  updateCourse(id: string, data: Partial<Course>) {
    const { id: _id, createdAt, ...clean } = data;
    return runInInjectionContext(this.injector, () => {
      const courseDoc = doc(this.firestore, `courses/${id}`);
      return updateDoc(courseDoc, this.clean(clean));
    });
  }

  deleteCourse(id: string) {
    return runInInjectionContext(this.injector, () => {
      const courseDoc = doc(this.firestore, `courses/${id}`);
      return deleteDoc(courseDoc);
    });
  }

  toggleOpen(id: string, isOpen: boolean) {
    return this.updateCourse(id, { isOpen: !isOpen });
  }

  // Firestore مبيقبلش undefined، فبنشيلها
  private clean<T>(data: T): T {
    return JSON.parse(JSON.stringify(data));
  }

  private time(c: Course): number {
    return c.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;
  }
}