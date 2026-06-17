export type UserRole = 'Manager' | 'Developer';

export interface UserNode {
  id: number;
  redmineUserId: number;
  name: string;
  designation: string;
  role: UserRole;
  reportsTo?: number;
  dailyHours?: number;
  directReports?: UserNode[];
}

export interface RedmineProject {
  id: number;
  name: string;
  identifier: string;
  owner: string;
}

export interface SprintSummary {
  id: number;
  versionId: any;
  projectId: number;
  projectName: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'Planned' | 'Active' | 'Closed';
  plannedHours: number;
  loggedHours: number;
  totalIssues: number;
  openIssues: number;
  bugs: number;
  crs: number;
  stories: number;
}

export interface TimeEntry {
  id: number;
  userId: number;
  userName: string;
  redmineUserId: number;
  projectId: number;
  sprintId: number;
  issueId: number;
  issueType: string
  issueSubject: string;
  hours: number;
  spentOn: string;
}

export interface PublicHoliday {
  date: string;
  name: string;
  hoursDeducted: number;
}

export interface CapacitySnapshot {
  workingDays: number;
  holidayCount: number;
  grossHours: number;
  holidayDeductionHours: number;
  budgetHours: number;
  loggedHours: number;
}

export interface WidgetDefinition {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

export interface OverviewSummary {
  totalMembers: number;
  activeMembersToday: number;
  totalProjects: number;
  activeSprintsCount: number;
  totalOpenIssues: number;
  totalBugs: number;
  totalCRs: number;
  totalStories: number;
  overallUtilization: number;    // % logged vs budget this week
  weekLoggedHours: number;
  weekBudgetHours: number;
  sprintHealthAvg: number;       // avg % complete across active sprints
  teamAtRisk: { name: string; utilization: number }[];  // under 50%
}
