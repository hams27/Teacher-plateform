import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, docData, query, where,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface Article {
  id?: string;
  title: string;
  category: string;
  body: string;          // نص المقالة
  isPublished: boolean;
  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class ArticlesService {
  private firestore: Firestore = inject(Firestore);
  private injector: Injector = inject(Injector);
  private articlesRef = collection(this.firestore, 'articles');

  // للأدمن: كل المقالات (منشورة ومخفية)
  getArticles(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(this.articlesRef, { idField: 'id' }) as Observable<Article[]>).pipe(
        map(list => this.newestFirst(list))
      )
    );
  }

  // للطلاب: المنشورة بس
  getPublished(): Observable<Article[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(query(this.articlesRef, where('isPublished', '==', true)), {
        idField: 'id'
      }) as Observable<Article[]>).pipe(map(list => this.newestFirst(list)))
    );
  }

  getArticle(id: string): Observable<Article | undefined> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, `articles/${id}`), { idField: 'id' }) as Observable<Article | undefined>
    );
  }

  addArticle(article: Article) {
    const { id, createdAt, ...data } = article;
    return runInInjectionContext(this.injector, () =>
      addDoc(this.articlesRef, { ...JSON.parse(JSON.stringify(data)), createdAt: serverTimestamp() })
    );
  }

  updateArticle(id: string, data: Partial<Article>) {
    const { id: _id, createdAt, ...clean } = data;
    return runInInjectionContext(this.injector, () => {
      const articleDoc = doc(this.firestore, `articles/${id}`);
      return updateDoc(articleDoc, JSON.parse(JSON.stringify(clean)));
    });
  }

  deleteArticle(id: string) {
    return runInInjectionContext(this.injector, () => {
      const articleDoc = doc(this.firestore, `articles/${id}`);
      return deleteDoc(articleDoc);
    });
  }

  togglePublish(id: string, isPublished: boolean) {
    return this.updateArticle(id, { isPublished: !isPublished });
  }

  private newestFirst(list: Article[]): Article[] {
    const t = (a: Article) => a.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => t(b) - t(a));
  }
}
