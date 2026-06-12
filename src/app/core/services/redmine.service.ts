import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
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
              id: 103,
              redmineUserId: 103,
              name: 'Rahul Mehta',
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

  private readonly projects: RedmineProject[] = [
    { id: 1, name: 'BTS Internal System', identifier: 'bts-system', owner: 'Paresh Sir' },
    { id: 2, name: 'Prompt Dairy Mobile', identifier: 'prompt-dairy-mobile', owner: 'Paresh Sir' },
    { id: 3, name: 'HR Portal', identifier: 'hr-portal', owner: 'QA Lead Team' }
  ];

  private readonly sprints: SprintSummary[] = [
    {
      id: 1001,
      projectId: 1,
      name: 'BTS Sprint 24.06',
      startDate: '2026-06-08',
      endDate: '2026-06-12',
      status: 'Active',
      plannedHours: 96,
      loggedHours: 78,
      totalIssues: 34,
      openIssues: 9,
      bugs: 6,
      crs: 4,
      stories: 7
    },
    {
      id: 1002,
      projectId: 2,
      name: 'Mobile App Sprint 18',
      startDate: '2026-06-08',
      endDate: '2026-06-12',
      status: 'Active',
      plannedHours: 80,
      loggedHours: 64,
      totalIssues: 29,
      openIssues: 11,
      bugs: 8,
      crs: 3,
      stories: 5
    },
    {
      id: 1003,
      projectId: 3,
      name: 'HR Portal Stabilization',
      startDate: '2026-06-08',
      endDate: '2026-06-12',
      status: 'Active',
      plannedHours: 48,
      loggedHours: 35,
      totalIssues: 21,
      openIssues: 6,
      bugs: 7,
      crs: 1,
      stories: 3
    }
  ];

  private readonly timeEntries: TimeEntry[] = [
    // { id: 1, userId: 101, redmineUserId: 101, projectId: 1, sprintId: 1001, issueId: 4481, issueSubject: 'Team budget dashboard API', issueType: 'User Story', hours: 7.5, spentOn: '2026-06-08' },
    // { id: 2, userId: 101, redmineUserId: 101, projectId: 1, sprintId: 1001, issueId: 4482, issueSubject: 'Hierarchy drilldown chart', issueType: 'Task', hours: 8, spentOn: '2026-06-09' },
    // { id: 3, userId: 101, redmineUserId: 101, projectId: 2, sprintId: 1002, issueId: 5102, issueSubject: 'Milk collection sync issue', issueType: 'Bug', hours: 6.5, spentOn: '2026-06-10' },
    // { id: 4, userId: 101, redmineUserId: 101, projectId: 1, sprintId: 1001, issueId: 4484, issueSubject: 'Holiday capacity formula', issueType: 'Task', hours: 5, spentOn: '2026-06-12' },
    // { id: 5, userId: 102, redmineUserId: 102, projectId: 1, sprintId: 1001, issueId: 4491, issueSubject: 'Redmine import mapping', issueType: 'CR', hours: 8, spentOn: '2026-06-08' },
    // { id: 6, userId: 102, redmineUserId: 102, projectId: 2, sprintId: 1002, issueId: 5103, issueSubject: 'Farmer payment report', issueType: 'User Story', hours: 7, spentOn: '2026-06-09' },
    // { id: 7, userId: 102, redmineUserId: 102, projectId: 2, sprintId: 1002, issueId: 5105, issueSubject: 'Collection receipt print', issueType: 'Task', hours: 8, spentOn: '2026-06-10' },
    // { id: 8, userId: 102, redmineUserId: 102, projectId: 1, sprintId: 1001, issueId: 4498, issueSubject: 'Timesheet missing report', issueType: 'Task', hours: 7.5, spentOn: '2026-06-12' },
    // { id: 9, userId: 103, redmineUserId: 103, projectId: 1, sprintId: 1001, issueId: 4501, issueSubject: 'Sprint issue grouping', issueType: 'Task', hours: 4, spentOn: '2026-06-08' },
    // { id: 10, userId: 103, redmineUserId: 103, projectId: 2, sprintId: 1002, issueId: 5111, issueSubject: 'Login token refresh defect', issueType: 'Bug', hours: 5.5, spentOn: '2026-06-10' },
    // { id: 11, userId: 104, redmineUserId: 104, projectId: 3, sprintId: 1003, issueId: 6120, issueSubject: 'Payroll regression testing', issueType: 'Task', hours: 8, spentOn: '2026-06-08' },
    // { id: 12, userId: 104, redmineUserId: 104, projectId: 3, sprintId: 1003, issueId: 6123, issueSubject: 'Attendance bug verification', issueType: 'Bug', hours: 7, spentOn: '2026-06-09' },
    // { id: 13, userId: 104, redmineUserId: 104, projectId: 3, sprintId: 1003, issueId: 6124, issueSubject: 'Release sanity', issueType: 'Support', hours: 4, spentOn: '2026-06-12' },
    // { id: 14, userId: 105, redmineUserId: 105, projectId: 3, sprintId: 1003, issueId: 6131, issueSubject: 'Leave workflow test cases', issueType: 'User Story', hours: 6, spentOn: '2026-06-08' },
    // { id: 15, userId: 105, redmineUserId: 105, projectId: 1, sprintId: 1001, issueId: 4511, issueSubject: 'Dashboard QA review', issueType: 'Bug', hours: 5, spentOn: '2026-06-12' },
    // { id: 16, userId: 201, redmineUserId: 201, projectId: 1, sprintId: 1001, issueId: 4511, issueSubject: 'Farmer payment report', issueType: 'Bug', hours: 5, spentOn: '2026-06-12' },
    // { id: 17, userId: 20, redmineUserId: 20, projectId: 1, sprintId: 1001, issueId: 4520, issueSubject: 'Sprint planning and review', issueType: 'Meeting', hours: 6, spentOn: '2026-06-08' },
    // { id: 18, userId: 30, redmineUserId: 30, projectId: 3, sprintId: 1003, issueId: 6139, issueSubject: 'QA release coordination', issueType: 'Meeting', hours: 4, spentOn: '2026-06-10' }
  ];

  getHierarchy(): Observable<UserNode[]> {
    return of(this.hierarchyData);
  }

  constructor(private http: HttpClient) {}

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

  getProjects(): Observable<{ projects: RedmineProject[] }> {
    if (!this.hasApiKey()) {
      return of({ projects: this.projects });
    }

    return this.http.get<{ projects: RedmineProject[] }>(
      `${this.apiBaseUrl}/projects.json`,
      { headers: this.getHeaders() }
    ).pipe(
      map(response => ({
        projects: response.projects.map(project => ({
          id: project.id,
          name: project.name,
          identifier: project.identifier,
          owner: 'Redmine'
        }))
      })),
      catchError(error => {
        console.warn('Redmine projects API failed. Falling back to mock projects.', error);
        return of({ projects: this.projects });
      })
    );
  }

  getSprints(projectId = 'all'): Observable<SprintSummary[]> {
    return of(this.filterByProject(this.sprints, projectId));
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

  getSpentTime(startDate: string, endDate: string, projectId = 'all'): Observable<TimeEntry[]> {
    if (!this.hasApiKey()) {
      // mock path — add userName to mock data too (see step 3)
      const start = this.toDate(startDate);
      const end = this.toDate(endDate);
      return of(
        this.timeEntries.filter(entry => {
          const spentOn = this.toDate(entry.spentOn);
          const matchesDate = spentOn >= start && spentOn <= end;
          const matchesProject = projectId === 'all' || entry.projectId === Number(projectId);
          return matchesDate && matchesProject;
        })
      );
    }

    const params = [
      `spent_on=><${startDate}|${endDate}`,
      projectId !== 'all' ? `project_id=${projectId}` : '',
      `limit=100`
    ].filter(Boolean).join('&');

    return this.http.get<{ time_entries: any[] }>(
      `${this.apiBaseUrl}/time_entries.json?${params}`,
      { headers: this.getHeaders() }
    ).pipe(
      map(res => res.time_entries.map(e => ({
        id: e.id,
        userId: e.user.id,
        userName: e.user.name,          // ← here
        redmineUserId: e.user.id,
        projectId: e.project.id,
        sprintId: 0,
        issueId: e.issue?.id ?? 0,
        issueSubject: e.comments ?? '',
        issueType: e.activity?.name ?? 'Task',
        hours: e.hours,
        spentOn: e.spent_on
      }))),
      catchError(error => {
        console.warn('Redmine time entries API failed. Falling back to mock.', error);
        return of(this.timeEntries);
      })
    );
  }

  calculateCapacity(startDate: string, endDate: string, hierarchy: UserNode[], entries: TimeEntry[]): CapacitySnapshot {
    const weekdays = this.countWeekdays(startDate, endDate);
    const holidays = this.getHolidaysInRange(startDate, endDate);
    const dailyCapacityHours = hierarchy.reduce((sum, node) => sum + this.calculateSubtreeDailyHours(node), 0);
    const grossHours = weekdays * dailyCapacityHours;
    const holidayDeductionHours = holidays.length * dailyCapacityHours;

    return {
      workingDays: weekdays - holidays.length,
      holidayCount: holidays.length,
      grossHours,
      holidayDeductionHours,
      budgetHours: grossHours - holidayDeductionHours,
      loggedHours: this.sumHours(entries)
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
