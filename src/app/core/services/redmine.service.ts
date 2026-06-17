import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, lastValueFrom, of } from 'rxjs';
import {
  CapacitySnapshot,
  PublicHoliday,
  RedmineProject,
  SprintSummary,
  TimeEntry,
  UserNode,
  WidgetDefinition
} from '../../dashboard/dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class RedmineService {
  private readonly standardDailyHours = 8;
  private readonly apiBaseUrl = '/redmine-api';
  private readonly apiKeyStorageKey = '6d18a984feda82e9a2b028bbe1163f932ccc67a3';

  // ── Cache ────────────────────────────────────────────────────────────────
  private _allVersions: SprintSummary[] = [];
  private _activeVersions: SprintSummary[] = [];  // only status === 'open'
  isLoading = false;   // public so dashboard can show loader

  private readonly publicHolidays: PublicHoliday[] = [
    { date: '2026-06-11', name: 'Local Public Holiday', hoursDeducted: 8 },
    { date: '2026-06-19', name: 'Regional Holiday', hoursDeducted: 8 }
  ];

  private readonly hierarchyData: UserNode[] = [
    {
      id: 10,
      redmineUserId: 10,
      name: "Rupa Golwala",
      designation: 'Delivery Head',
      role: 'Manager',
      dailyHours: 8,
      directReports: [
        {
          id: 20,
          redmineUserId: 20,
          name: 'Paresh Kalriya',
          designation: 'Engineering Manager',
          role: 'Manager',
          reportsTo: 10,
          dailyHours: 8,
          directReports: [
            {
              id: 101,
              redmineUserId: 101,
              name: 'Shivang Patel',
              designation: 'Developer',
              role: 'Developer',
              reportsTo: 20,
              dailyHours: 8,
              directReports: [
                {
                  id: 201,
                  redmineUserId: 201,
                  name: 'Jaimin Vasveliya',
                  designation: 'Jr. Developer',
                  role: 'Developer',
                  reportsTo: 101,
                  dailyHours: 8,
                  directReports: []
                }
              ]
            },
            {
              id: 102,
              redmineUserId: 102,
              name: 'Kiran Gami',
              designation: 'Developer',
              role: 'Developer',
              reportsTo: 20,
              dailyHours: 8,
              directReports: [
                {
                  id: 202,
                  redmineUserId: 202,
                  name: 'Aman Gupta',
                  designation: 'Jr. Developer',
                  role: 'Developer',
                  reportsTo: 102,
                  dailyHours: 8,
                  directReports: []
                }
              ]
            },
            {
              id: 104,
              redmineUserId: 104,
              name: 'Rahul Giri',
              designation: 'Developer',
              role: 'Developer',
              reportsTo: 20,
              dailyHours: 8
            },
            {
              id: 105,
              redmineUserId: 105,
              name: 'Nilkanth Pund',
              designation: 'Developer',
              role: 'Developer',
              reportsTo: 20,
              dailyHours: 8
            }
          ]
        },
        {
          id: 30,
          redmineUserId: 30,
          name: 'QA Lead Team',
          designation: 'QA Manager',
          role: 'Manager',
          reportsTo: 10,
          dailyHours: 8,
          directReports: [
            {
              id: 104,
              redmineUserId: 104,
              name: 'Aarti Joshi',
              designation: 'QA Engineer',
              role: 'Developer',
              reportsTo: 30,
              dailyHours: 8
            },
            {
              id: 105,
              redmineUserId: 105,
              name: 'Mehul Trivedi',
              designation: 'QA Engineer',
              role: 'Developer',
              reportsTo: 30,
              dailyHours: 8
            }
          ]
        }
      ]
    }
  ];

  private projects: RedmineProject[] = [];

  // private readonly sprints: SprintSummary[] = [
  //   {
  //     id: 1001,
  //     projectId: 1,
  //     name: 'BTS Sprint 24.06',
  //     startDate: '2026-06-08',
  //     endDate: '2026-06-12',
  //     status: 'Active',
  //     plannedHours: 96,
  //     loggedHours: 78,
  //     totalIssues: 34,
  //     openIssues: 9,
  //     bugs: 6,
  //     crs: 4,
  //     stories: 7
  //   },
  //   {
  //     id: 1002,
  //     projectId: 2,
  //     name: 'Mobile App Sprint 18',
  //     startDate: '2026-06-08',
  //     endDate: '2026-06-12',
  //     status: 'Active',
  //     plannedHours: 80,
  //     loggedHours: 64,
  //     totalIssues: 29,
  //     openIssues: 11,
  //     bugs: 8,
  //     crs: 3,
  //     stories: 5
  //   },
  //   {
  //     id: 1003,
  //     projectId: 3,
  //     name: 'HR Portal Stabilization',
  //     startDate: '2026-06-08',
  //     endDate: '2026-06-12',
  //     status: 'Active',
  //     plannedHours: 48,
  //     loggedHours: 35,
  //     totalIssues: 21,
  //     openIssues: 6,
  //     bugs: 7,
  //     crs: 1,
  //     stories: 3
  //   }
  // ];

  async loadAllData(): Promise<void> {
    this.isLoading = true;

    try {
      // Step 1: Fetch all versions for all projects in parallel
      const versionsResult = await this.fetchAllVersions();

      // Step 2: Separate active (open) vs non-active versions
      const allVersionEntries: { version: any; projectId: number; projectName: string }[] = [];
      const activeVersionEntries: { version: any; projectId: number; projectName: string }[] = [];

      versionsResult.forEach(({ project, versions }) => {
        versions.forEach((v: any) => {
          const entry = { version: v, projectId: project.id, projectName: project.name };
          allVersionEntries.push(entry);
          if (v.status === 'open') {
            activeVersionEntries.push(entry);
          }
        });
      });

      // Step 3: Fetch issues ONLY for active versions — one request per version, all in parallel
      // const issuesByVersion = new Map<number, any[]>();
      // await Promise.all(
      //   activeVersionEntries.map(async ({ version, projectId }) => {
      //     const issues = await this.fetchIssuesForVersion(version.id, projectId);
      //     issuesByVersion.set(version.id, issues);
      //   })
      // );

      // Step 4: Build SprintSummary for ALL versions (non-active get empty issues)
      this._allVersions = allVersionEntries.map(({ version, projectId, projectName }) =>
        this.mapVersionToSprint(version, projectId, projectName, [])
      );

      // Step 5: Active-only views
      this._activeVersions = this._allVersions.filter(s => s.status === 'Active');

    } finally {
      this.isLoading = false;
    }
  }

  /** Fetch all issues for a single version (scoped, paginated, fast) */
  private async fetchIssuesForVersion(versionId: number, projectId: number): Promise<any[]> {
    const PAGE = 100;
    const result: any[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const res = await lastValueFrom(
        this.http.get<{ issues: any[]; total_count: number }>(
          `${this.apiBaseUrl}/issues.json`,
          {
            headers: this.getHeaders(),
            params: {
              project_id: projectId.toString(),
              fixed_version_id: versionId.toString(),
              status_id: '*',
              limit: PAGE.toString(),
              offset: offset.toString()
            }
          }
        )
      );

      result.push(...(res.issues ?? []));
      total = res.total_count;
      offset += PAGE;
      if (result.length >= 500) break;  // safety cap per sprint
    }

    return result;
  }

  // Fetch all project versions in parallel
  private async fetchAllVersions(): Promise<{ project: RedmineProject; versions: any[] }[]> {
    return Promise.all(
      this.projects.map(async project => {
        try {
          const res = await lastValueFrom(
            this.http.get<{ versions: any[] }>(
              `${this.apiBaseUrl}/projects/${project.id}/versions.json`,
              { headers: this.getHeaders() }
            )
          );
          return { project, versions: res.versions ?? [] };
        } catch {
          return { project, versions: [] };
        }
      })
    );
  }

  // Fetch ALL time entries (no date filter — full history)
  private async fetchAllTimeEntries(): Promise<TimeEntry[]> {
    const PAGE = 100;
    const result: TimeEntry[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const res = await lastValueFrom(
        this.http.get<{ time_entries: any[]; total_count: number }>(
          `${this.apiBaseUrl}/time_entries.json`,
          {
            headers: this.getHeaders(),
            params: { limit: PAGE.toString(), offset: offset.toString() }
          }
        )
      );

      result.push(...(res.time_entries ?? []).map((e: any) => ({
        id: e.id,
        userId: e.user.id,
        userName: e.user.name,
        redmineUserId: e.user.id,
        projectId: e.project.id,
        sprintId: e.fixed_version?.id ?? 0,
        issueId: e.issue?.id ?? 0,
        issueSubject: e.comments ?? '',
        issueType: e.activity?.name ?? 'Task',
        hours: e.hours,
        spentOn: e.spent_on
      })));

      total = res.total_count;
      offset += PAGE;
      if (result.length >= 5000) break;  // safety cap
    }

    return result;
  }

  getHierarchy(): Observable<UserNode[]> {
    const headers = this.getHeaders();

    return this.http.get<UserNode[]>('/bts-api/api/hierarchy', { headers }).pipe(
      catchError(err => {
        console.warn('Hierarchy API failed, using mock', err);
        return of(this.hierarchyData);
      })
    );
  }

  constructor(private http: HttpClient) { }

  getApiKey(): string {
    return localStorage.getItem(this.apiKeyStorageKey) ?? '';
  }

  setApiKey(apiKey: string): void {
    const cleanKey = apiKey.trim();

    if (cleanKey) {
      localStorage.setItem(this.apiKeyStorageKey, cleanKey);
      return;
    }

    localStorage.removeItem(this.apiKeyStorageKey);
  }

  hasApiKey(): boolean {
    return Boolean(this.getApiKey());
  }

  async getProjects(): Promise<{ projects: RedmineProject[] }> {

    try {
      const response = await lastValueFrom(
        this.http.get<{ projects: any[] }>(
          `${this.apiBaseUrl}/projects.json`,
          {
            headers: this.getHeaders(),
            params: {
              limit: 100,
            }
          }
        )
      );

      const projects = response.projects.map(project => ({
        id: project.id,
        name: project.name,
        identifier: project.identifier,
        owner: 'Redmine'
      }));

      this.projects = projects;
      await this.loadAllData();
      return { projects };

    } catch (error) {
      console.warn('Redmine projects API failed. Falling back to mock projects.', error);
      return { projects: this.projects };
    }
  }

  // getSprints(projectId = 'all'): Observable<SprintSummary[]> {
  //   return of(this.filterByProject(this.sprints, projectId));
  // }

  // async getSprints(projectId = 'all'): Promise<SprintSummary[]> {

  //   try {
  //     const projectsToFetch = projectId === 'all'
  //       ? this.projects
  //       : [{ id: Number(projectId), name: '', identifier: '', owner: '' }];

  //     if (!projectsToFetch.length) return [];

  //     // Fetch versions for all projects in parallel
  //     const versionResults = await Promise.all(
  //       projectsToFetch.map(async project => {
  //         try {
  //           const res = await lastValueFrom(
  //             this.http.get<{ versions: any[] }>(
  //               `${this.apiBaseUrl}/projects/${project.id}/versions.json`,
  //               { headers: this.getHeaders() }
  //             )
  //           );
  //           return { project, versions: res.versions ?? [] };
  //         } catch {
  //           return { project, versions: [] };
  //         }
  //       })
  //     );

  //     // Flatten all versions
  //     const allVersions = versionResults.flatMap(({ project, versions }) =>
  //       versions.map(v => ({ projectId: project.id, projectName: project.name, version: v }))
  //     );

  //     if (!allVersions.length) return [];

  //     // Fetch issues for all versions in parallel
  //     const sprints = await Promise.all(
  //       allVersions.map(async ({ projectId, projectName, version }) => {
  //         try {
  //           const res = await lastValueFrom(
  //             this.http.get<{ issues: any[] }>(
  //               `${this.apiBaseUrl}/issues.json`,
  //               {
  //                 headers: this.getHeaders(),
  //                 params: {
  //                   project_id: projectId,
  //                   fixed_version_id: version.id,
  //                   limit: '100',
  //                   status_id: '*'
  //                 }
  //               }
  //             )
  //           );
  //           return this.mapVersionToSprint(version, projectId, projectName, res.issues ?? []);
  //         } catch {
  //           return this.mapVersionToSprint(version, projectId, projectName, []);
  //         }
  //       })
  //     );

  //     return sprints;

  //   } catch (err) {
  //     console.error('Sprints API failed, using mock', err);
  //     return [];
  //   }
  // }

  /** All versions (Active + Closed + Planned), optionally filtered by project */
  getSprints(projectId = 'all'): SprintSummary[] {
    return projectId === 'all'
      ? this._allVersions
      : this._allVersions.filter(s => s.projectId === Number(projectId));
  }

  /** Only Active (open) sprints — fast, no closed/planned noise */
  getActiveSprints(projectId = 'all'): SprintSummary[] {
    return projectId === 'all'
      ? this._activeVersions
      : this._activeVersions.filter(s => s.projectId === Number(projectId));
  }

  /** Issues belonging to active sprints only */

  private mapVersionToSprint(
    version: any,
    projectId: number,
    projectName: string,
    issues: any[]
  ): SprintSummary {
    const openIssues = issues.filter(i => !['Closed', 'Resolved', 'Rejected'].includes(i.status?.name)).length;
    const bugs = issues.filter(i => i.tracker?.name === 'Bug').length;
    const crs = issues.filter(i => ['CR', 'Change Request'].includes(i.tracker?.name)).length;
    const stories = issues.filter(i => ['User Story', 'Feature'].includes(i.tracker?.name)).length;
    const loggedHours = issues.reduce((s, i) => s + (i.spent_hours ?? 0), 0);
    const plannedHours = issues.reduce((s, i) => s + (i.estimated_hours ?? 0), 0);

    // Map Redmine version status to our status
    const statusMap: Record<string, 'Planned' | 'Active' | 'Closed'> = {
      open: 'Active',
      locked: 'Closed',
      closed: 'Closed'
    };

    return {
      id: version.id,
      versionId: version.id,
      projectId,
      projectName,
      name: version.name,
      startDate: version.created_on?.slice(0, 10) ?? '',
      endDate: version.due_date ?? '',
      status: statusMap[version.status] ?? 'Planned',
      plannedHours,
      loggedHours: Math.round(loggedHours * 10) / 10,
      totalIssues: issues.length,
      openIssues,
      bugs,
      crs,
      stories
    };
  }

  getPublicHolidays(): Observable<PublicHoliday[]> {
    return of(this.publicHolidays);
  }

  getWidgetCatalog(): Observable<WidgetDefinition[]> {
    return of([
      { id: 'hierarchy', title: 'Hierarchy Capacity', description: 'Manager to developer budget and logged hours.', enabled: true },
      { id: 'project', title: 'Project Effort', description: 'Project-wise budget burn and Redmine effort.', enabled: true },
      { id: 'sprint', title: 'Sprint Health', description: 'Sprint issues, bugs, CRs, stories, and open work.', enabled: true },
      { id: 'timesheet', title: 'Timesheet Gaps', description: 'Missing or low logged hours by user/date.', enabled: true }
    ]);
  }

  // getSpentTime(startDate: string, endDate: string, projectId = 'all'): Observable<TimeEntry[]> {
  //   const PAGE_LIMIT = 100;

  //   // 1. Build base query parameters
  //   let queryParams = new HttpParams()
  //     .set('spent_on', `><${startDate}|${endDate}`)
  //     .set('limit', PAGE_LIMIT.toString());

  //   if (projectId !== 'all') {
  //     queryParams = queryParams.set('project_id', projectId);
  //   }

  //   // Helper to execute a single page HTTP request
  //   const fetchPage = (offset: number) => {
  //     const paramsWithOffset = queryParams.set('offset', offset.toString());
  //     return this.http.get<{ time_entries: any[]; total_count: number }>(
  //       `${this.apiBaseUrl}/time_entries.json`,
  //       { headers: this.getHeaders(), params: paramsWithOffset }
  //     );
  //   };

  //   // 2. Multi-page pagination stream using RxJS expand
  //   return fetchPage(0).pipe(
  //     expand((res, index) => {
  //       const nextOffset = (index + 1) * PAGE_LIMIT;
  //       // If the current offset + items fetched is less than total_count, fetch next page
  //       if (nextOffset < res.total_count) {
  //         return fetchPage(nextOffset);
  //       }
  //       // Otherwise, complete the pagination stream
  //       return of(null);
  //     }),
  //     // Stop the stream when expand returns of(null)
  //     takeWhile((res): res is NonNullable<typeof res> => res !== null),
  //     // Map individual API entries to your frontend model format per page
  //     map(res => {
  //       return res.time_entries.map(e => ({
  //         id: e.id,
  //         userId: e.user.id,
  //         userName: e.user.name,
  //         redmineUserId: e.user.id,
  //         projectId: e.project.id,
  //         sprintId: 0,
  //         issueId: e.issue?.id ?? 0,
  //         issueSubject: e.comments ?? '',
  //         issueType: e.activity?.name ?? 'Task',
  //         hours: e.hours,
  //         spentOn: e.spent_on
  //       }));
  //     }),
  //     // Combine arrays from all pages back into a single flat array
  //     reduce((accumulator, currentBatch) => accumulator.concat(currentBatch), [] as TimeEntry[]),
  //     catchError(error => {
  //       console.warn('Redmine time entries API failed. Falling back to mock.', error);
  //       return of([]);
  //     })
  //   );
  // }
  // REPLACE entire getSpentTime:

  private fetchToken = 0;

  async getSpentTime(
    startDate: string,
    endDate: string,
    projectId = 'all'
  ): Promise<TimeEntry[]> {
    this.isLoading = true;
    const token = ++this.fetchToken;

    const PAGE = 100;
    const CONCURRENCY = 5;

    const buildParams = (offset: number): any => {
      const p: any = {
        limit: PAGE.toString(),
        offset: offset.toString(),
        spent_on: `><${startDate}|${endDate}`
      };
      if (projectId !== 'all') p['project_id'] = projectId;
      return p;
    };

    const mapEntry = (e: any): TimeEntry => ({
      id: e.id,
      userId: e.user.id,
      userName: e.user.name,
      redmineUserId: e.user.id,
      projectId: e.project.id,
      sprintId: e.fixed_version?.id ?? 0,
      issueId: e.issue?.id ?? 0,
      issueSubject: e.comments ?? '',
      issueType: e.activity?.name ?? 'Task',
      hours: e.hours,
      spentOn: e.spent_on
    });

    const fetchPage = (offset: number) => {
      if (token !== this.fetchToken) return Promise.resolve({ time_entries: [], total_count: 0 });
      return lastValueFrom(
        this.http.get<{ time_entries: any[]; total_count: number }>(
          `${this.apiBaseUrl}/time_entries.json`,
          { headers: this.getHeaders(), params: buildParams(offset) }
        )
      ).catch(() => ({ time_entries: [], total_count: 0 }));
    };

    try {
      const first = await fetchPage(0);
      if (token !== this.fetchToken) return [];

      const total = first.total_count;
      const results = (first.time_entries ?? []).map(mapEntry);

      if (total > PAGE) {
        const offsets = Array.from(
          { length: Math.ceil((total - PAGE) / PAGE) },
          (_, i) => (i + 1) * PAGE
        );

        for (let i = 0; i < offsets.length; i += CONCURRENCY) {
          if (token !== this.fetchToken) return [];  // abort mid-batch
          const batch = offsets.slice(i, i + CONCURRENCY);
          const pages = await Promise.all(batch.map(fetchPage));
          pages.forEach(p => results.push(...(p.time_entries ?? []).map(mapEntry)));
        }
      }

      if (token !== this.fetchToken) return [];
      return results;

    } catch (err) {
      console.warn('Time entries fetch failed', err);
      return [];
    } finally {
      if (token === this.fetchToken) this.isLoading = false;
    }
  }


  // getSpentTime(startDate: string, endDate: string, projectId = 'all'): TimeEntry[] {
  //   const entries = this._cacheLoaded ? this._allEntries : this.timeEntries;
  //   return entries.filter(e => {
  //     const matchDate = e.spentOn >= startDate && e.spentOn <= endDate;
  //     const matchProject = projectId === 'all' || e.projectId === Number(projectId);
  //     return matchDate && matchProject;
  //   });
  // }

  private flattenHierarchy(nodes: UserNode[]): UserNode[] {
    return nodes.flatMap(node => [
      node,
      ...(node.directReports ? this.flattenHierarchy(node.directReports) : [])
    ]);
  }
  calculateCapacity(startDate: string, endDate: string, hierarchy: UserNode[], entries: TimeEntry[]): CapacitySnapshot {
    const weekdays = this.countWeekdays(startDate, endDate);
    const holidays = this.getHolidaysInRange(startDate, endDate);
    const dailyCapacityHours = hierarchy.reduce((sum, node) => sum + this.calculateSubtreeDailyHours(node), 0);
    const grossHours = weekdays * dailyCapacityHours;
    const holidayDeductionHours = holidays.length * dailyCapacityHours;

    // Team users from hierarchy
    const teamUserName = new Set(
      this.flattenHierarchy(hierarchy).map(u => u.name.toLowerCase().trim())
    );

    // Only team members' entries
    const teamEntries = entries.filter(
      e => teamUserName.has(e.userName.toLowerCase().trim())
    );

    return {
      workingDays: weekdays - holidays.length,
      holidayCount: holidays.length,
      grossHours,
      holidayDeductionHours,
      budgetHours: grossHours - holidayDeductionHours,
      loggedHours: this.sumHours(teamEntries)
    };
  }

  calculateSubtreeDailyHours(node: UserNode): number {
    const ownHours = node.dailyHours ?? this.standardDailyHours;
    const reporteeHours = node.directReports?.reduce((sum, child) => sum + this.calculateSubtreeDailyHours(child), 0) ?? 0;
    return ownHours + reporteeHours;
  }

  getHolidaysInRange(startDate: string, endDate: string): PublicHoliday[] {
    const start = this.toDate(startDate);
    const end = this.toDate(endDate);

    return this.publicHolidays.filter(holiday => {
      const date = this.toDate(holiday.date);
      return date >= start && date <= end && !this.isWeekend(date);
    });
  }

  sumHours(entries: TimeEntry[]): number {

    return entries.reduce((sum, entry) => sum + entry.hours, 0);
  }

  private countWeekdays(startDate: string, endDate: string): number {
    let count = 0;
    const current = this.toDate(startDate);
    const end = this.toDate(endDate);

    while (current <= end) {
      if (!this.isWeekend(current)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private filterByProject<T extends { projectId: number }>(items: T[], projectId: string): T[] {
    if (projectId === 'all') {
      return items;
    }

    return items.filter(item => item.projectId === Number(projectId));
  }

  private toDate(value: string): Date {
    return new Date(`${value}T00:00:00`);
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-Redmine-API-Key': this.getApiKey()
    });
  }
}
