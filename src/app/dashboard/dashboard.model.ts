export type UserRole = 'Manager' | 'Developer';
export type IssueType = 'User Story' | 'Task' | 'Bug' | 'CR' | 'Support' | 'Meeting';

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
  projectId: number;
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
  issueSubject: string;
  issueType: IssueType;
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
