import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AppUserSession {
  redmineUserId: number;
  redmineName: string;
  redmineLogin: string;
  email: string;
  apiKey: string;
  internalId: number | null;
  role: 'SuperAdmin' | 'Admin' | 'User';
  lastActiveAt: number;  // timestamp
}

const SESSION_KEY    = 'bts_session';
const INACTIVITY_MS  = 5 * 24 * 60 * 60 * 1000;  // 5 days

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly redmineBase = environment.redmineBase;
  private readonly btsBase     = environment.btsBase;

  private _session = new BehaviorSubject<AppUserSession | null>(null);
  session$ = this._session.asObservable();

  private inactivityTimer: any;

  constructor(private http: HttpClient, private ngZone: NgZone) {
    this.restoreSession();
    this.bindActivityEvents();
  }

  get session(): AppUserSession | null { return this._session.value; }
  get isSuperAdmin(): boolean { return this._session.value?.role === 'SuperAdmin'; }
  get isAdmin(): boolean { return ['Admin','SuperAdmin'].includes(this._session.value?.role ?? ''); }
  get isLoggedIn(): boolean { return this._session.value !== null; }

  // ── Login ────────────────────────────────────────────────────────────────
  login(apiKey: string): Observable<AppUserSession> {
    const headers = new HttpHeaders({ 'X-Redmine-API-Key': apiKey });

    return this.http.get<any>(`${this.redmineBase}/users/current.json`, { headers }).pipe(
      switchMap(res => {
        const u           = res.user;
        const redmineName = `${u.firstname} ${u.lastname}`.trim();
        const email       = u.mail ?? '';

        return this.http.get<any[]>(`${this.btsBase}/api/users`, {
          headers: new HttpHeaders({ 'X-Redmine-Api-Key': apiKey })
        }).pipe(
          map(users => {
            const match = users.find(dbUser =>
              this.normalizeName(dbUser.name) === this.normalizeName(redmineName)
            );
            return this.createSession(u, redmineName, email, apiKey, match);
          }),
          catchError(() => of(this.createSession(u, redmineName, email, apiKey, null)))
        );
      })
    );
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  logout(): void {
    localStorage.removeItem(SESSION_KEY);
    this._session.next(null);
    clearTimeout(this.inactivityTimer);
  }

  // ── Touch activity timestamp ─────────────────────────────────────────────
  touchActivity(): void {
    const s = this._session.value;
    if (!s) return;
    const updated = { ...s, lastActiveAt: Date.now() };
    this._session.next(updated);
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    this.resetInactivityTimer();
  }

  // ── Private ───────────────────────────────────────────────────────────────
  private createSession(
    u: any,
    redmineName: string,
    email: string,
    apiKey: string,
    dbUser: any | null
  ): AppUserSession {
    const session: AppUserSession = {
      redmineUserId: u.id,
      redmineName,
      redmineLogin: u.login ?? '',
      email,
      apiKey,
      internalId:   dbUser?.id ?? null,
      role:         (dbUser?.role as any) ?? 'User',
      lastActiveAt: Date.now()
    };
    this._session.next(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.resetInactivityTimer();
    return session;
  }

  private restoreSession(): void {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;

      const session: AppUserSession = JSON.parse(raw);
      const elapsed = Date.now() - session.lastActiveAt;

      if (elapsed > INACTIVITY_MS) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }

      this._session.next(session);
      this.resetInactivityTimer();
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  private resetInactivityTimer(): void {
    clearTimeout(this.inactivityTimer);
    const remaining = INACTIVITY_MS - (Date.now() - (this._session.value?.lastActiveAt ?? Date.now()));
    this.ngZone.runOutsideAngular(() => {
      this.inactivityTimer = setTimeout(() => {
        this.ngZone.run(() => this.logout());
      }, Math.max(remaining, 0));
    });
  }

  private bindActivityEvents(): void {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let debounce: any;
    this.ngZone.runOutsideAngular(() => {
      events.forEach(evt =>
        window.addEventListener(evt, () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => this.ngZone.run(() => this.touchActivity()), 5000);
        }, { passive: true })
      );
    });
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}
